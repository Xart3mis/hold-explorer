//! Export: what a saved file or a copy holds is gathered under the state lock, whole, and then
//! written without it, as a file or onto the clipboard.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use chrono::{DateTime, Local, NaiveDate};
use hx_core::dataset::Dataset;
use hx_core::filter::FilterSpec;
use hx_core::mapping::Field;
use hx_core::solve::SolvePlan;
use hx_export::chart::{chart_svg, ChartChoice};
use hx_export::fonts::Fonts;
use hx_export::raster::{png, rgba};
use hx_export::{
    csv, line_ids, scope_line_ids, screen_sheets, status_report, tab_separated, workbook,
    workbook_sheets, About, ExportError, ExportRequest, ExportText, ReportHead, Screen, Sheet,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::data::empty_dataset;
use super::error::CommandError;
use super::snapshots::ViewRef;
use super::AppState;

/// What a saved export answers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct ExportSaved {
    /// The path the file was saved at, as it was asked for.
    pub path: String,
    /// How many rows of data the file holds: the rows of its sheets for a workbook, of its table
    /// for a CSV file; 0 for a chart or the report, which hold no table.
    pub rows: usize,
}

/// What the interface asks to save.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "kind")]
pub enum SaveFormat {
    /// The screen as an Excel workbook, with its About sheet.
    Excel,
    /// Every screen at once, as one Excel workbook.
    Workbook,
    /// The screen's table as a CSV file: its first table, the cross-tab of holds for the matrix.
    Csv,
    /// The PDF status report of the kept holds.
    Report,
    /// A chart as a PNG image.
    ChartPng {
        /// The chart.
        chart: ChartChoice,
    },
    /// A chart as an SVG document.
    ChartSvg {
        /// The chart.
        chart: ChartChoice,
    },
}

/// What the interface asks to copy.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "kind")]
pub enum CopyFormat {
    /// The screen's table as tab-separated text, with its header.
    Table,
    /// The line IDs of the rows in scope, one a line, each once.
    LineIds,
    /// A chart as an image.
    Chart {
        /// The chart.
        chart: ChartChoice,
    },
}

/// The phases an export reports on its channel.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub enum ExportPhase {
    /// What the file holds is being gathered, with the state locked.
    Reading,
    /// The file is being made and written, with the state free.
    Writing,
}

/// What an export writes, gathered under the lock and written without it: the sheets of a
/// workbook, a CSV, or the clipboard text; or a clone of the dataset, the plan, and the inputs a
/// chart or the report draws from. It owns everything it needs and borrows nothing of the state.
#[derive(Debug, Clone)]
pub enum Content {
    /// The sheets of a workbook or of a CSV file, with what the About sheet states.
    Sheets {
        /// The sheets, in order.
        sheets: Vec<Sheet>,
        /// What the About sheet states.
        about: About,
    },
    /// The text to put on the clipboard.
    Text(String),
    /// What a chart is drawn from.
    Chart {
        /// The snapshot in view; an empty one for a workspace without a snapshot.
        dataset: Dataset,
        /// The solve plan of the open kept holds, for the curve; `None` for another chart, or
        /// when the filter keeps released holds only.
        plan: Option<SolvePlan>,
        /// The filter as the snapshot can apply it.
        spec: FilterSpec,
        /// The chart.
        chart: ChartChoice,
        /// The active filters as the filter bar writes them.
        filters: Vec<String>,
    },
    /// What the report is drawn from.
    Report {
        /// The snapshot in view; an empty one for a workspace without a snapshot.
        dataset: Dataset,
        /// The solve plan of the open kept holds; `None` when the filter keeps released holds
        /// only.
        plan: Option<SolvePlan>,
        /// The filter as the snapshot can apply it.
        spec: FilterSpec,
        /// What the report's header states.
        head: ReportHead,
    },
}

/// A clipboard, so tests can stand in for the system's.
pub trait Clipboard {
    /// Puts `text` on the clipboard.
    fn text(&mut self, text: &str) -> Result<(), CommandError>;
    /// Puts an image of `width` by `height` opaque RGBA pixels on the clipboard, row by row from
    /// the top.
    fn image(&mut self, width: u32, height: u32, rgba: &[u8]) -> Result<(), CommandError>;
}

/// The system's clipboard, made for one copy.
pub struct SystemClipboard(arboard::Clipboard);

impl SystemClipboard {
    /// Opens the system's clipboard; `Clipboard` when the system refuses it.
    pub fn new() -> Result<SystemClipboard, CommandError> {
        arboard::Clipboard::new()
            .map(SystemClipboard)
            .map_err(clipboard_error)
    }
}

impl Clipboard for SystemClipboard {
    fn text(&mut self, text: &str) -> Result<(), CommandError> {
        self.0.set_text(text).map_err(clipboard_error)
    }

    fn image(&mut self, width: u32, height: u32, rgba: &[u8]) -> Result<(), CommandError> {
        let (width, height) = (
            usize::try_from(width).map_err(|_| too_large())?,
            usize::try_from(height).map_err(|_| too_large())?,
        );
        self.0
            .set_image(arboard::ImageData {
                width,
                height,
                bytes: rgba.into(),
            })
            .map_err(clipboard_error)
    }
}

/// What a clipboard the system refused means to the user.
fn clipboard_error(error: arboard::Error) -> CommandError {
    CommandError::new(
        "Clipboard",
        format!(
            "Hold Explorer could not use the clipboard: {error}. Another program may hold the clipboard; wait a moment and copy again."
        ),
    )
}

fn too_large() -> CommandError {
    CommandError::internal(
        "The image is too large for the clipboard of this system. Save the chart as a file instead.",
    )
}

/// The faces every file is drawn with, read once.
pub fn fonts() -> &'static Fonts {
    static FONTS: OnceLock<Fonts> = OnceLock::new();
    FONTS.get_or_init(Fonts::embedded)
}

/// The snapshot in view as an export reads it, owned.
struct Inputs {
    /// The dataset of the snapshot in view; an empty one for a workspace without a snapshot.
    dataset: Dataset,
    /// The filter of the request as the snapshot can apply it.
    spec: FilterSpec,
    /// The solve plan of the open kept holds, when it was asked for and the filter keeps open
    /// holds.
    plan: Option<SolvePlan>,
    /// The optional fields the snapshot has no value for.
    absent: Vec<Field>,
    /// The extra columns of the snapshot.
    custom_dims: Vec<String>,
}

/// Where the snapshot in view comes from, for About and the report's header.
struct Origin {
    workspace: String,
    /// The day of the snapshot; the day the file is made for a workspace without one.
    snapshot: NaiveDate,
    /// The name of the file the snapshot was imported from; empty without a snapshot.
    file_name: String,
    made_at: DateTime<Local>,
}

impl AppState {
    /// Checks the view and gathers what the file holds: sheets, or the inputs of a chart or a
    /// report (a clone of the dataset and the plan it needs), under the lock.
    pub fn export_content(
        &mut self,
        request: &ExportRequest,
        format: &SaveFormat,
        view: &ViewRef,
    ) -> Result<Content, CommandError> {
        let needs_plan = match format {
            SaveFormat::Excel | SaveFormat::Csv => matches!(request.screen, Screen::Blockers),
            SaveFormat::Workbook | SaveFormat::Report => true,
            SaveFormat::ChartPng { chart } | SaveFormat::ChartSvg { chart } => {
                matches!(chart, ChartChoice::Curve { .. })
            }
        };
        let inputs = self.inputs(view, &request.spec, needs_plan)?;
        let origin = self.origin()?;
        match format {
            SaveFormat::Excel | SaveFormat::Csv => {
                let sheets = screen_sheets(
                    &inputs.dataset,
                    inputs.plan.as_ref(),
                    &inputs.absent,
                    &applied(request, &inputs),
                )?;
                Ok(sheets_content(sheets, request, origin))
            }
            SaveFormat::Workbook => {
                let sheets = workbook_sheets(
                    &inputs.dataset,
                    inputs.plan.as_ref(),
                    &inputs.absent,
                    &inputs.custom_dims,
                    &inputs.spec,
                    &request.filters,
                    &request.text,
                )?;
                Ok(sheets_content(sheets, request, origin))
            }
            SaveFormat::Report => Ok(Content::Report {
                head: ReportHead {
                    workspace: origin.workspace,
                    snapshot: origin.snapshot,
                    filters: request.filters.clone(),
                    app_version: env!("CARGO_PKG_VERSION").to_string(),
                    made_at: origin.made_at.fixed_offset(),
                },
                dataset: inputs.dataset,
                plan: inputs.plan,
                spec: inputs.spec,
            }),
            SaveFormat::ChartPng { chart } | SaveFormat::ChartSvg { chart } => {
                Ok(chart_content(inputs, chart, request))
            }
        }
    }

    /// The same for a copy.
    pub fn copy_content(
        &mut self,
        request: &ExportRequest,
        format: &CopyFormat,
        view: &ViewRef,
    ) -> Result<Content, CommandError> {
        let needs_plan = match format {
            CopyFormat::Table | CopyFormat::LineIds => matches!(request.screen, Screen::Blockers),
            CopyFormat::Chart { chart } => matches!(chart, ChartChoice::Curve { .. }),
        };
        let inputs = self.inputs(view, &request.spec, needs_plan)?;
        match format {
            CopyFormat::Table => {
                let sheets = screen_sheets(
                    &inputs.dataset,
                    inputs.plan.as_ref(),
                    &inputs.absent,
                    &applied(request, &inputs),
                )?;
                let sheet = first(&sheets)?;
                Ok(Content::Text(tab_separated(sheet, &request.text)?))
            }
            CopyFormat::LineIds => {
                let ids = scope_line_ids(
                    &inputs.dataset,
                    inputs.plan.as_ref(),
                    &applied(request, &inputs),
                );
                Ok(Content::Text(line_ids(&ids)))
            }
            CopyFormat::Chart { chart } => Ok(chart_content(inputs, chart, request)),
        }
    }

    /// Remembers a path the app wrote, so `export_open` can open it.
    pub fn wrote(&mut self, path: PathBuf) {
        self.written.insert(path);
    }

    /// Whether the app wrote this path in this session.
    pub fn has_written(&self, path: &Path) -> bool {
        self.written.contains(path)
    }

    /// `Ok` when the app wrote this path in this session, so it may be opened; `NotWritten`
    /// otherwise.
    pub fn openable(&self, path: &Path) -> Result<(), CommandError> {
        if self.has_written(path) {
            Ok(())
        } else {
            Err(CommandError::new(
                "NotWritten",
                "Hold Explorer opens only files it saved in this session. Open the file from its folder.",
            ))
        }
    }

    /// Checks `view` and clones what an export of the snapshot in view reads, with the solve plan
    /// of the open kept holds when `needs_plan`. A workspace without a snapshot is read as an
    /// empty snapshot, as every data command reads it.
    fn inputs(
        &mut self,
        view: &ViewRef,
        spec: &FilterSpec,
        needs_plan: bool,
    ) -> Result<Inputs, CommandError> {
        let (spec, ranked, absent, custom_dims) = self.in_view(view, spec, |v| {
            let columns = v.columns;
            (
                v.spec.clone(),
                v.spec.open_only(),
                columns.map(|c| c.absent.clone()).unwrap_or_default(),
                columns.map(|c| c.custom_dims.clone()).unwrap_or_default(),
            )
        })?;
        let ranked = ranked.filter(|_| needs_plan);
        let (dataset, plan) = match (self.selected, ranked) {
            (Some(selected), Some(ranked)) => {
                let (dataset, plan) = self.filtered_plan(selected, &ranked)?;
                (dataset.clone(), Some(plan.clone()))
            }
            (Some(selected), None) => (self.dataset(selected)?.clone(), None),
            (None, ranked) => (
                empty_dataset(),
                ranked.map(|_| SolvePlan {
                    nodes: Vec::new(),
                    steps: Vec::new(),
                }),
            ),
        };
        Ok(Inputs {
            dataset,
            spec,
            plan,
            absent,
            custom_dims,
        })
    }

    /// The workspace and the snapshot in view, and the moment, for About and the report.
    fn origin(&self) -> Result<Origin, CommandError> {
        let workspace = self.open.as_ref().ok_or_else(CommandError::no_workspace)?;
        let made_at = Local::now();
        let (snapshot, file_name) = match self.selected {
            Some(selected) => {
                let info = workspace.snapshot(selected)?;
                (info.taken_at.date(), info.file_name)
            }
            None => (made_at.date_naive(), String::new()),
        };
        Ok(Origin {
            workspace: workspace.info()?.name,
            snapshot,
            file_name,
            made_at,
        })
    }
}

/// The request with its filter as the snapshot can apply it.
fn applied(request: &ExportRequest, inputs: &Inputs) -> ExportRequest {
    ExportRequest {
        spec: inputs.spec.clone(),
        ..request.clone()
    }
}

fn sheets_content(sheets: Vec<Sheet>, request: &ExportRequest, origin: Origin) -> Content {
    let rows = sheets.iter().map(|sheet| sheet.rows.len()).sum();
    Content::Sheets {
        sheets,
        about: About {
            workspace: origin.workspace,
            snapshot: origin.snapshot,
            file_name: origin.file_name,
            filters: request.filters.clone(),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            made_at: origin.made_at.naive_local(),
            rows,
        },
    }
}

fn chart_content(inputs: Inputs, chart: &ChartChoice, request: &ExportRequest) -> Content {
    Content::Chart {
        dataset: inputs.dataset,
        plan: inputs.plan,
        spec: inputs.spec,
        chart: chart.clone(),
        filters: request.filters.clone(),
    }
}

/// The first sheet: the one a CSV file or the clipboard holds.
fn first(sheets: &[Sheet]) -> Result<&Sheet, CommandError> {
    sheets.first().ok_or_else(|| {
        CommandError::internal(
            "The screen gave no table to write. This is a fault of Hold Explorer: try again, and report it if it happens again.",
        )
    })
}

/// A content that does not belong to the format asked for: a fault of the application.
fn mismatch() -> CommandError {
    CommandError::internal(
        "The export gathered something other than what the format needs. This is a fault of Hold Explorer: try again, and report it if it happens again.",
    )
}

/// The SVG of a chart content.
fn draw(content: Content, text: &ExportText, fonts: &Fonts) -> Result<String, CommandError> {
    let Content::Chart {
        dataset,
        plan,
        spec,
        chart,
        filters,
    } = content
    else {
        return Err(mismatch());
    };
    Ok(chart_svg(
        &dataset,
        plan.as_ref(),
        &spec,
        &chart,
        &filters,
        text,
        fonts,
    )?)
}

/// Writes `content` in `format`: the bytes of the file, or the clipboard's text or image.
pub fn render(
    content: Content,
    format: &SaveFormat,
    text: &ExportText,
    fonts: &Fonts,
) -> Result<Vec<u8>, CommandError> {
    match (format, content) {
        (SaveFormat::Excel | SaveFormat::Workbook, Content::Sheets { sheets, about }) => {
            Ok(workbook(&sheets, &about, text)?)
        }
        (SaveFormat::Csv, Content::Sheets { sheets, .. }) => Ok(csv(first(&sheets)?, text)?),
        (
            SaveFormat::Report,
            Content::Report {
                dataset,
                plan,
                spec,
                head,
            },
        ) => Ok(status_report(
            &dataset,
            plan.as_ref(),
            &spec,
            &head,
            text,
            fonts,
        )?),
        (SaveFormat::ChartSvg { .. }, content @ Content::Chart { .. }) => {
            Ok(draw(content, text, fonts)?.into_bytes())
        }
        (SaveFormat::ChartPng { .. }, content @ Content::Chart { .. }) => {
            Ok(png(&draw(content, text, fonts)?, fonts)?)
        }
        _ => Err(mismatch()),
    }
}

/// What writes the bytes of a file to its path: [`hx_export::write_file`], or a stand-in in tests.
pub type WriteFile = dyn Fn(&Path, &[u8]) -> Result<(), ExportError>;

/// Makes the file of `content` in `format` and writes it to `path` with `write`, whole or not at
/// all. Runs without the state lock.
pub fn save(
    content: Content,
    format: &SaveFormat,
    path: &Path,
    text: &ExportText,
    fonts: &Fonts,
    write: &WriteFile,
) -> Result<ExportSaved, CommandError> {
    let rows = match (&content, format) {
        (Content::Sheets { sheets, .. }, SaveFormat::Csv) => {
            sheets.first().map_or(0, |sheet| sheet.rows.len())
        }
        (Content::Sheets { about, .. }, _) => about.rows,
        _ => 0,
    };
    let bytes = render(content, format, text, fonts)?;
    write(path, &bytes)?;
    Ok(ExportSaved {
        path: path.to_string_lossy().into_owned(),
        rows,
    })
}

/// Puts `content` on `clipboard`: its text, or the chart as an image. Runs without the state
/// lock.
pub fn copy(
    content: Content,
    clipboard: &mut dyn Clipboard,
    text: &ExportText,
    fonts: &Fonts,
) -> Result<(), CommandError> {
    match content {
        Content::Text(words) => clipboard.text(&words),
        content @ Content::Chart { .. } => {
            let (width, height, pixels) = rgba(&draw(content, text, fonts)?, fonts)?;
            clipboard.image(width, height, &pixels)
        }
        Content::Sheets { .. } | Content::Report { .. } => Err(mismatch()),
    }
}
