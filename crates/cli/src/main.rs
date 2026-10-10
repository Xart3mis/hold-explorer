#![forbid(unsafe_code)]

use std::error::Error;
use std::path::PathBuf;
use std::process::ExitCode;

use chrono::{NaiveDate, NaiveDateTime};
use clap::{Parser, Subcommand};
use hx_core::dataset::Dataset;
use hx_core::filter::{Dim, FilterSpec};
use hx_core::load::{load_file, open_file, parse_opened};
use hx_core::mapping::ColumnMap;
use hx_core::query::{group_by, lines, summary, LineQuery};
use hx_core::rules::RuleSet;
use hx_core::snapshot_date::{SnapshotDate, SnapshotSource};
use hx_core::solve::solve_plan;
use hx_store::{list_workspaces, ImportOptions, Workspace};
use hx_synth::{generate, write_workbook, SynthConfig};
use serde_json::{json, Map, Value};

#[derive(Parser)]
#[command(
    name = "hx-cli",
    version,
    about = "Hold Explorer engine from the command line"
)]
struct Cli {
    #[command(subcommand)]
    command: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Write a synthetic PlantIM-shaped workbook.
    Synth {
        #[arg(long)]
        out: PathBuf,
        #[arg(long, default_value_t = 1)]
        seed: u64,
        #[arg(long, default_value_t = 3600)]
        lines: usize,
        #[arg(long, default_value_t = 9300)]
        holds: usize,
    },
    /// Read a holds file and print a JSON summary of its open holds.
    Summary { file: PathBuf },
    /// Work with workspaces: history stores that keep each import as a snapshot.
    Ws {
        #[command(subcommand)]
        command: WsCmd,
    },
}

#[derive(Subcommand)]
enum WsCmd {
    /// Create a workspace file in a folder and print its info.
    Create { dir: PathBuf, name: String },
    /// List the workspaces in a folder, and the workspace files that could not be read.
    List { dir: PathBuf },
    /// Import a holds file into a workspace as a new snapshot.
    Import {
        workspace: PathBuf,
        file: PathBuf,
        /// Snapshot date, YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS.
        #[arg(long)]
        date: Option<String>,
        /// Id of a snapshot this import replaces.
        #[arg(long)]
        replace: Option<i64>,
    },
    /// List the snapshots of a workspace, oldest first.
    Snapshots { workspace: PathBuf },
    /// Print the summary of a stored snapshot (the newest by default).
    Summary {
        workspace: PathBuf,
        #[arg(long)]
        snapshot: Option<i64>,
    },
}

/// The JSON that `summary` and `ws summary` share. Callers add keys of their own.
fn report(
    ds: &Dataset,
    taken: NaiveDateTime,
    source: SnapshotSource,
    project: Option<String>,
    limited: bool,
    skipped: usize,
    warnings: usize,
) -> Map<String, Value> {
    let open = FilterSpec::default();
    let top_lines: Vec<_> = lines(ds, &open, &LineQuery::default())
        .into_iter()
        .take(10)
        .collect();
    let Value::Object(report) = json!({
        "snapshot": taken.to_string(),
        "snapshot_source": source,
        "project": project,
        "limited": limited,
        "skipped": skipped,
        "warnings": warnings,
        "summary": summary(ds, &open),
        "by_discipline": group_by(ds, &open, &Dim::Discipline),
        "by_hold_type": group_by(ds, &open, &Dim::HoldType),
        "top_lines": top_lines,
        "solve": solve_plan(ds, &open, Some(10)).steps,
    }) else {
        unreachable!("json! of an object literal is an object");
    };
    report
}

fn parse_date(text: &str) -> Result<NaiveDateTime, String> {
    let text = text.trim();
    NaiveDate::parse_from_str(text, "%Y-%m-%d")
        .ok()
        .and_then(|day| day.and_hms_opt(0, 0, 0))
        .or_else(|| NaiveDateTime::parse_from_str(text, "%Y-%m-%dT%H:%M:%S").ok())
        .ok_or_else(|| {
            format!(
                "The date \"{text}\" is not one this tool reads. Write it as YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS, for example 2026-10-07 or 2026-10-07T13:16:00."
            )
        })
}

fn print_json(value: &impl serde::Serialize) -> Result<(), Box<dyn Error>> {
    println!("{}", serde_json::to_string_pretty(value)?);
    Ok(())
}

fn run_ws(command: WsCmd) -> Result<(), Box<dyn Error>> {
    match command {
        WsCmd::Create { dir, name } => {
            print_json(&Workspace::create(&dir, &name)?.info()?)?;
        }
        WsCmd::List { dir } => print_json(&list_workspaces(&dir)?)?,
        WsCmd::Import {
            workspace,
            file,
            date,
            replace,
        } => {
            let date = date.as_deref().map(parse_date).transpose()?;
            let mut ws = Workspace::open(&workspace)?;
            let opened = open_file(&file)?;
            let saved = ws.saved_mapping()?.unwrap_or_default();
            let map = ColumnMap::auto_with(&opened.table.headers, &saved);
            let loaded = parse_opened(&opened, &map)?;
            let taken = match (date, loaded.snapshot) {
                (Some(at), _) => SnapshotDate {
                    at,
                    source: SnapshotSource::User,
                },
                (None, Some(found))
                    if matches!(
                        found.source,
                        SnapshotSource::InfoSheet | SnapshotSource::FileName
                    ) =>
                {
                    found
                }
                (None, _) => {
                    return Err("Could not work out when this file was taken: it has no report date and no date in its name. Pass the date with --date, for example --date 2026-10-07.".into());
                }
            };
            let info = ws.import(&loaded, taken, &ImportOptions { replace })?;
            ws.set_saved_mapping(&map.to_saved(&loaded.headers))?;
            if let Some(project) = loaded.project_no() {
                ws.add_project_number(project)?;
            }
            let mut out = serde_json::to_value(&info)?;
            out["warnings"] = loaded.parsed.warnings.len().into();
            out["skipped"] = loaded.parsed.skipped.len().into();
            print_json(&out)?;
        }
        WsCmd::Snapshots { workspace } => print_json(&Workspace::open(&workspace)?.snapshots()?)?,
        WsCmd::Summary {
            workspace,
            snapshot,
        } => {
            let ws = Workspace::open(&workspace)?;
            let id = match snapshot {
                Some(id) => id,
                None => {
                    ws.latest()?
                        .ok_or("This workspace has no snapshots yet. Import a file first with `hx-cli ws import`.")?
                        .id
                }
            };
            let detail = ws.snapshot_detail(id)?;
            let ds = ws.dataset(id, RuleSet::builtin())?;
            let project = detail
                .info_sheet
                .get(hx_core::load::INFO_PROJECT_NO)
                .cloned();
            print_json(&report(
                &ds,
                detail.info.taken_at,
                detail.info.date_source,
                project,
                detail.info.limited,
                detail.skipped.len(),
                detail.warnings.len(),
            ))?;
        }
    }
    Ok(())
}

fn run(cli: Cli) -> Result<(), Box<dyn Error>> {
    match cli.command {
        Cmd::Synth {
            out,
            seed,
            lines,
            holds,
        } => {
            let cfg = SynthConfig::new(seed, lines, holds);
            write_workbook(&generate(&cfg), &cfg, &out)?;
            eprintln!("Wrote {} holds to {}", holds, out.display());
        }
        Cmd::Summary { file } => {
            let loaded = load_file(&file)?;
            let snapshot = loaded
                .snapshot
                .ok_or("Could not work out the snapshot date. Rename the file to include it, for example holds_2026-10-07.xlsx.")?;
            let project = loaded.info.get(hx_core::load::INFO_PROJECT_NO).cloned();
            let limited = loaded.parsed.limited;
            let skipped = loaded.parsed.skipped.len();
            let warnings = loaded.parsed.warnings.len();

            let ds = Dataset::build(loaded.parsed.holds, RuleSet::builtin(), snapshot.at);
            let mut out = report(
                &ds,
                snapshot.at,
                snapshot.source,
                project,
                limited,
                skipped,
                warnings,
            );
            out.insert("sheet".into(), loaded.sheet_name.into());
            print_json(&out)?;
        }
        Cmd::Ws { command } => run_ws(command)?,
    }
    Ok(())
}

fn main() -> ExitCode {
    match run(Cli::parse()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
