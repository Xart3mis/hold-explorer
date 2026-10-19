//! Export: what a saved file or a copy holds is gathered under the state lock, whole, and then
//! written without it, as a file or onto the clipboard.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use chrono::{DateTime, FixedOffset, Local, NaiveDate};
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

/// The system's clipboard.
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
        self.0
            .set_image(arboard::ImageData {
                // A `u32` fits a `usize` on every target the app is built for (32 and 64 bits).
                width: width as usize,
                height: height as usize,
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

/// The one clipboard of the session, kept from the first copy on, under a lock of its own and
/// never under the state lock.
///
/// On X11 a program owns what it put on the clipboard only while its clipboard is alive: one
/// made and dropped for each copy would lose the copy on a desktop without a clipboard manager.
/// A clipboard that failed is dropped, and the next copy makes it again.
#[derive(Default)]
pub struct SessionClipboard(Mutex<Option<Box<dyn SendClipboard>>>);

impl SessionClipboard {
    /// Puts `content` on the system's clipboard; see [`copy`].
    pub fn copy(
        &self,
        content: Content,
        text: &ExportText,
        fonts: &Fonts,
    ) -> Result<(), CommandError> {
        self.copy_with(content, text, fonts, &|| {
            SystemClipboard::new().map(|clipboard| Box::new(clipboard) as Box<dyn SendClipboard>)
        })
    }

    /// [`SessionClipboard::copy`] with the function that makes a clipboard.
    pub(super) fn copy_with(
        &self,
        content: Content,
        text: &ExportText,
        fonts: &Fonts,
        make: &dyn Fn() -> Result<Box<dyn SendClipboard>, CommandError>,
    ) -> Result<(), CommandError> {
        // A copy that panicked leaves nothing of the clipboard to distrust: start afresh.
        let mut kept = self.0.lock().unwrap_or_else(|poisoned| {
            let mut kept = poisoned.into_inner();
            kept.take();
            kept
        });
        let clipboard = match kept.as_mut() {
            Some(clipboard) => clipboard,
            None => kept.insert(make()?),
        };
        let copied = copy(content, clipboard.as_mut(), text, fonts);
        if copied.is_err() {
            kept.take();
        }
        copied
    }
}

/// A clipboard the session can keep: one that can move between threads.
pub trait SendClipboard: Clipboard + Send {}

impl<T: Clipboard + Send> SendClipboard for T {}

/// The faces every file is drawn with, read once.
pub fn fonts() -> &'static Fonts {
    static FONTS: OnceLock<Fonts> = OnceLock::new();
    FONTS.get_or_init(Fonts::embedded)
}

/// The snapshot in view as an export reads it, borrowed from the state.
struct Inputs<'a> {
    /// The dataset of the snapshot in view; an empty one for a workspace without a snapshot.
    dataset: &'a Dataset,
    /// The filter of the request as the snapshot can apply it.
    spec: FilterSpec,
    /// The solve plan of the open kept holds, when it was asked for and the filter keeps open
    /// holds.
    plan: Option<&'a SolvePlan>,
    /// The optional fields the snapshot has no value for.
    absent: &'a [Field],
    /// The extra columns of the snapshot.
    custom_dims: &'a [String],
}

impl Inputs<'_> {
    /// The request with its filter as the snapshot can apply it.
    fn applied(&self, request: &ExportRequest) -> ExportRequest {
        ExportRequest {
            spec: self.spec.clone(),
            ..request.clone()
        }
    }
}

/// Where the snapshot in view comes from, for About and the report's header.
struct Origin {
    workspace: String,
    /// The day of the snapshot; `None` for a workspace without one.
    snapshot: Option<NaiveDate>,
    /// The name of the file the snapshot was imported from; empty without a snapshot.
    file_name: String,
    made_at: DateTime<FixedOffset>,
}

/// Whether an export reads the solve plan of the open kept holds.
fn chart_needs_plan(chart: &ChartChoice) -> bool {
    matches!(chart, ChartChoice::Curve { .. })
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
        self.check_view(view)?;
        match format {
            SaveFormat::Excel | SaveFormat::Csv => {
                let origin = self.origin()?;
                let blockers = matches!(request.screen, Screen::Blockers);
                let sheets = self.read(view, &request.spec, blockers, |v| {
                    screen_sheets(v.dataset, v.plan, v.absent, &v.applied(request))
                })??;
                Ok(sheets_content(sheets, request, origin))
            }
            SaveFormat::Workbook => {
                let origin = self.origin()?;
                let sheets = self.read(view, &request.spec, true, |v| {
                    workbook_sheets(
                        v.dataset,
                        v.plan,
                        v.absent,
                        v.custom_dims,
                        &v.spec,
                        &request.filters,
                        &request.text,
                    )
                })??;
                Ok(sheets_content(sheets, request, origin))
            }
            SaveFormat::Report => {
                let origin = self.origin()?;
                self.read(view, &request.spec, true, |v| Content::Report {
                    head: ReportHead {
                        workspace: origin.workspace,
                        snapshot: origin.snapshot,
                        filters: request.filters.clone(),
                        app_version: env!("CARGO_PKG_VERSION").to_string(),
                        made_at: origin.made_at,
                    },
                    dataset: v.dataset.clone(),
                    plan: v.plan.cloned(),
                    spec: v.spec,
                })
            }
            SaveFormat::ChartPng { chart } | SaveFormat::ChartSvg { chart } => {
                self.chart_content(view, chart, request)
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
        let blockers = matches!(request.screen, Screen::Blockers);
        match format {
            CopyFormat::Table => self.read(view, &request.spec, blockers, |v| {
                let sheets = screen_sheets(v.dataset, v.plan, v.absent, &v.applied(request))?;
                Ok(Content::Text(tab_separated(
                    first(&sheets)?,
                    &request.text,
                )?))
            })?,
            CopyFormat::LineIds => self.read(view, &request.spec, blockers, |v| {
                let ids = scope_line_ids(v.dataset, v.plan, &v.applied(request));
                Content::Text(line_ids(&ids))
            }),
            CopyFormat::Chart { chart } => self.chart_content(view, chart, request),
        }
    }

    /// The inputs of a chart, cloned: they are drawn without the lock.
    fn chart_content(
        &mut self,
        view: &ViewRef,
        chart: &ChartChoice,
        request: &ExportRequest,
    ) -> Result<Content, CommandError> {
        self.read(view, &request.spec, chart_needs_plan(chart), |v| {
            Content::Chart {
                dataset: v.dataset.clone(),
                plan: v.plan.cloned(),
                spec: v.spec,
                chart: chart.clone(),
                filters: request.filters.clone(),
            }
        })
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

    /// Checks `view` and gives `read` what an export of the snapshot in view reads, with the
    /// solve plan of the open kept holds when `needs_plan`. A workspace without a snapshot is
    /// read as an empty snapshot, as every data command reads it.
    fn read<T>(
        &mut self,
        view: &ViewRef,
        spec: &FilterSpec,
        needs_plan: bool,
        read: impl FnOnce(Inputs<'_>) -> T,
    ) -> Result<T, CommandError> {
        let (spec, ranked) = self.in_view(view, spec, |v| (v.spec.clone(), v.spec.open_only()))?;
        let ranked = ranked.filter(|_| needs_plan);
        let Some(selected) = self.selected else {
            let plan = ranked.map(|_| SolvePlan {
                nodes: Vec::new(),
                steps: Vec::new(),
            });
            return Ok(read(Inputs {
                dataset: &empty_dataset(),
                spec,
                plan: plan.as_ref(),
                absent: &[],
                custom_dims: &[],
            }));
        };
        // Built and kept by `in_view` above, so taken without work here.
        let (absent, custom_dims) = {
            let (_, columns) = self.columns(selected)?;
            (columns.absent.clone(), columns.custom_dims.clone())
        };
        let (dataset, plan) = match ranked {
            Some(ranked) => {
                let (dataset, plan) = self.filtered_plan(selected, &ranked)?;
                (dataset, Some(plan))
            }
            None => (self.dataset(selected)?, None),
        };
        Ok(read(Inputs {
            dataset,
            spec,
            plan,
            absent: &absent,
            custom_dims: &custom_dims,
        }))
    }

    /// The workspace and the snapshot in view, and the moment, for About and the report.
    fn origin(&self) -> Result<Origin, CommandError> {
        let workspace = self.open.as_ref().ok_or_else(CommandError::no_workspace)?;
        let (snapshot, file_name) = match self.selected {
            Some(selected) => {
                let info = workspace.snapshot(selected)?;
                (Some(info.taken_at.date()), info.file_name)
            }
            None => (None, String::new()),
        };
        Ok(Origin {
            workspace: workspace.info()?.name,
            snapshot,
            file_name,
            made_at: Local::now().fixed_offset(),
        })
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
            made_at: origin.made_at,
            rows,
        },
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

/// The extension a file of `format` is saved with, without its dot.
pub fn extension(format: &SaveFormat) -> &'static str {
    match format {
        SaveFormat::Excel | SaveFormat::Workbook => "xlsx",
        SaveFormat::Csv => "csv",
        SaveFormat::Report => "pdf",
        SaveFormat::ChartPng { .. } => "png",
        SaveFormat::ChartSvg { .. } => "svg",
    }
}

/// Refuses a path whose extension is not the one of `format`, compared without regard to case:
/// the app writes and later opens only a file of the kind it made, never one a program would run.
pub fn check_extension(format: &SaveFormat, path: &Path) -> Result<(), CommandError> {
    let wanted = extension(format);
    let found = path.extension().and_then(|found| found.to_str());
    if found.is_some_and(|found| found.eq_ignore_ascii_case(wanted)) {
        return Ok(());
    }
    let file = path.file_name().map_or_else(
        || path.display().to_string(),
        |name| name.to_string_lossy().into_owned(),
    );
    Err(CommandError::new(
        "Extension",
        format!(
            "Hold Explorer did not save {file}: this export is saved as a .{wanted} file, and the name ends otherwise. Save it again with a name that ends in .{wanted}."
        ),
    ))
}

/// What writes the bytes of a file to its path: [`hx_export::write_file`], or a stand-in in tests.
pub type WriteFile = dyn Fn(&Path, &[u8]) -> Result<(), ExportError>;

/// Makes the file of `content` in `format` and writes it to `path` with `write`, whole or not at
/// all. Runs without the state lock. `Extension` when the extension of `path` is not the one of
/// `format`; nothing is made or written then.
pub fn save(
    content: Content,
    format: &SaveFormat,
    path: &Path,
    text: &ExportText,
    fonts: &Fonts,
    write: &WriteFile,
) -> Result<ExportSaved, CommandError> {
    check_extension(format, path)?;
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
