#![forbid(unsafe_code)]

use std::error::Error;
use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use hx_core::dataset::Dataset;
use hx_core::filter::{Dim, FilterSpec};
use hx_core::load::load_file;
use hx_core::query::{group_by, lines, summary, LineQuery};
use hx_core::rules::RuleSet;
use hx_core::solve::solve_plan;
use hx_synth::{generate, write_workbook, SynthConfig};
use serde_json::json;

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
            let open = FilterSpec::default();
            let top_lines: Vec<_> = lines(&ds, &open, &LineQuery::default())
                .into_iter()
                .take(10)
                .collect();

            let report = json!({
                "snapshot": snapshot.at.to_string(),
                "snapshot_source": snapshot.source,
                "project": project,
                "sheet": loaded.sheet_name,
                "limited": limited,
                "skipped": skipped,
                "warnings": warnings,
                "summary": summary(&ds, &open),
                "by_discipline": group_by(&ds, &open, &Dim::Discipline),
                "by_hold_type": group_by(&ds, &open, &Dim::HoldType),
                "top_lines": top_lines,
                "solve": solve_plan(&ds, &open, Some(10)).steps,
            });
            println!("{}", serde_json::to_string_pretty(&report)?);
        }
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
