#![forbid(unsafe_code)]

//! Seeded generator of synthetic PlantIM-shaped hold exports.
//!
//! Reproduces the quirks of the real export: blank disciplines, remarks with
//! trailing line breaks and the literal `_x000D_`, bulk rows that share one
//! timestamp, sizes of zero, and lines whose two sizes disagree.

pub mod rng;

use std::path::Path;

use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime, Timelike};
use rust_xlsxwriter::{ExcelDateTime, Format, Workbook, XlsxError};

use rng::Rng;

pub const HEADERS: [&str; 14] = [
    "id",
    "line_id",
    "name",
    "role",
    "hold_remark",
    "hold_type",
    "discipline",
    "date",
    "released",
    "release_remark",
    "release_date",
    "model_size",
    "ldt_size",
    "stress_calc",
];

const ROLES: [&str; 5] = [
    "Designer",
    "Stress Analysis",
    "Stress Analysis QC",
    "Design QC",
    "Leader",
];

const HOLD_TYPES: [&str; 8] = [
    "MISC.",
    "PIPING VENDOR DATA",
    "EQUIPMENT VENDOR DATA",
    "P&ID",
    "INSTRUMENT VENDOR DATA",
    "LINE SIZE",
    "PMC UPDATE",
    "3D MODEL CATALOG",
];

const DISCIPLINES: [&str; 12] = [
    "Civil",
    "Piping",
    "Process",
    "I&Cs",
    "PV",
    "S&LP",
    "Electrical",
    "Machinery",
    "Material",
    "PM",
    "Procurement",
    "Customer",
];

const SERVICES: [&str; 8] = ["FW", "VT", "SM", "LS", "IA", "PA", "HC", "FL"];
const SIZES: [f64; 8] = [1.0, 2.0, 3.0, 4.0, 6.0, 8.0, 10.0, 12.0];

#[derive(Debug, Clone, PartialEq)]
pub struct SynthConfig {
    pub seed: u64,
    pub lines: usize,
    pub holds: usize,
    pub released_ratio: f64,
    pub report_date: NaiveDateTime,
    pub project_no: String,
}

impl SynthConfig {
    pub fn new(seed: u64, lines: usize, holds: usize) -> SynthConfig {
        SynthConfig {
            seed,
            lines,
            holds,
            released_ratio: 0.45,
            report_date: NaiveDate::from_ymd_opt(2026, 9, 29)
                .and_then(|d| d.and_hms_opt(13, 16, 0))
                .expect("constant date is valid"),
            project_no: "0000-TEST".to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SynthRow {
    pub id: i64,
    pub line_id: String,
    pub name: String,
    pub role: String,
    /// Raw, as PlantIM would export it: may hold line breaks and `_x000D_`.
    pub remark: String,
    pub hold_type: String,
    pub discipline: Option<String>,
    pub created: NaiveDateTime,
    pub released: bool,
    pub release_date: Option<NaiveDateTime>,
    pub model_size: Option<String>,
    pub ldt_size: Option<f64>,
    pub stress_calc: Option<String>,
}

struct Line {
    id: String,
    unit: usize,
    model_size: Option<String>,
    ldt_size: Option<f64>,
    stress_calc: Option<String>,
}

fn whole(n: f64) -> String {
    format!("{}", n as i64)
}

fn make_line(rng: &mut Rng, index: usize) -> Line {
    let unit = 500 + rng.below(90);
    let id = format!(
        "{:02}{}{:02}-{}-{:04}-{}-{:03}",
        30 + rng.below(60),
        rng.pick(&['A', 'B', 'R']),
        1 + rng.below(10),
        unit,
        index,
        rng.pick(&SERVICES),
        1 + rng.below(3),
    );
    let size = *rng.pick(&SIZES);
    let model_size = if rng.chance(0.02) {
        None
    } else {
        Some(whole(size))
    };
    let ldt_size = if rng.chance(0.09) {
        None
    } else if rng.chance(0.04) {
        Some(0.0)
    } else if rng.chance(0.2) {
        Some(*rng.pick(&SIZES))
    } else {
        Some(size)
    };
    let stress_calc = match rng.below(10) {
        0..=3 => None,
        4 => Some("NR".to_string()),
        _ => Some(format!("{}-001-FC-{:03}", unit, 1 + rng.below(40))),
    };
    Line {
        id,
        unit,
        model_size,
        ldt_size,
        stress_calc,
    }
}

fn make_remark(rng: &mut Rng, unit: usize) -> String {
    if rng.chance(0.002) {
        return String::new();
    }
    match rng.below(14) {
        0 => format!(
            "Hold Pending Civil Drawings for {unit}-PR-{:03}",
            100 * (1 + rng.below(5))
        ),
        1 => format!("Pending {unit}-STR-{:03} issuance", 1 + rng.below(9)),
        2 => "Hold Pending Acme FIV/AIV Report".to_string(),
        3 => "FIV/AIV REPORT\n".to_string(),
        4 => "Isometric by vendor".to_string(),
        5 => format!("control valve({unit}-PV-{:04}A)", 3000 + rng.below(80)),
        6 => format!(
            "Hold Pending Piping Platform Supports for {unit}-V-{:03}",
            100 + rng.below(400)
        ),
        7 => format!(
            "Tie-in T{:03}-R{:03} not confirmed",
            rng.below(1000),
            rng.below(1000)
        ),
        8 => "Pending Issuing SMR for Cold Shoes for uninsulated lines".to_string(),
        9 => "P&ID update_x000D_\nrev 2 pending".to_string(),
        10 => "Vendor Catalogue".to_string(),
        11 => format!("Hold pending IA layout for Unit {unit}"),
        12 => "LINE SIZE to be confirmed by process".to_string(),
        _ => "sleepers elevation".to_string(),
    }
}

pub fn generate(cfg: &SynthConfig) -> Vec<SynthRow> {
    let mut rng = Rng::new(cfg.seed);
    let lines: Vec<Line> = (0..cfg.lines.max(1))
        .map(|i| make_line(&mut rng, i))
        .collect();
    let names: Vec<String> = (1..=30).map(|n| format!("Engineer {n:02}")).collect();

    let mut rows = Vec::with_capacity(cfg.holds);
    let mut bulk: Option<(NaiveDateTime, usize)> = None;

    for index in 0..cfg.holds {
        let created = match bulk {
            Some((when, left)) if left > 0 => {
                bulk = Some((when, left - 1));
                when
            }
            _ => {
                let when = cfg.report_date
                    - Duration::days(rng.below(330) as i64)
                    - Duration::seconds(rng.below(86_400) as i64)
                    - Duration::milliseconds(rng.below(1000) as i64);
                bulk = if rng.chance(0.1) {
                    Some((when, 4 + rng.below(36)))
                } else {
                    None
                };
                when
            }
        };

        let line = &lines[rng.below(lines.len())];
        let open_seconds = (cfg.report_date - created).num_seconds();
        let released = rng.chance(cfg.released_ratio) && open_seconds > 3600;
        let release_date = if released {
            Some(created + Duration::seconds(1 + rng.below((open_seconds - 1) as usize) as i64))
        } else {
            None
        };

        rows.push(SynthRow {
            id: 70_000 + index as i64,
            line_id: line.id.clone(),
            name: rng.pick(&names).clone(),
            role: rng.pick(&ROLES).to_string(),
            remark: make_remark(&mut rng, line.unit),
            hold_type: rng.pick(&HOLD_TYPES).to_string(),
            discipline: if rng.chance(0.12) {
                None
            } else {
                Some(rng.pick(&DISCIPLINES).to_string())
            },
            created,
            released,
            release_date,
            model_size: line.model_size.clone(),
            ldt_size: line.ldt_size,
            stress_calc: line.stress_calc.clone(),
        });
    }
    rows
}

fn excel_datetime(dt: NaiveDateTime) -> Result<ExcelDateTime, XlsxError> {
    let seconds = dt.second() as f64 + dt.nanosecond() as f64 / 1e9;
    ExcelDateTime::from_ymd(dt.year() as u16, dt.month() as u8, dt.day() as u8)?.and_hms(
        dt.hour() as u16,
        dt.minute() as u8,
        seconds,
    )
}

/// Writes an `info` sheet and a `data` sheet laid out like the PlantIM export.
pub fn write_workbook(rows: &[SynthRow], cfg: &SynthConfig, path: &Path) -> Result<(), XlsxError> {
    let mut workbook = Workbook::new();

    let info = workbook.add_worksheet();
    info.set_name("info")?;
    let pairs = [
        ("Generated From", "hx-synth synthetic generator".to_string()),
        ("Project No.", cfg.project_no.clone()),
        ("Report Name", "holds".to_string()),
        (
            "Report Date",
            cfg.report_date.format("%m/%d/%Y %I:%M %p").to_string(),
        ),
        ("Report Filter Params", "{}".to_string()),
    ];
    for (row, (key, value)) in pairs.iter().enumerate() {
        info.write_string(row as u32, 0, *key)?;
        info.write_string(row as u32, 1, value.as_str())?;
    }

    let data = workbook.add_worksheet();
    data.set_name("data")?;
    let timestamp = Format::new().set_num_format("yyyy-mm-dd hh:mm:ss.000");
    for (column, header) in HEADERS.iter().enumerate() {
        data.write_string(0, column as u16, *header)?;
    }
    for (index, r) in rows.iter().enumerate() {
        let row = (index + 1) as u32;
        data.write_number(row, 0, r.id as f64)?;
        data.write_string(row, 1, &r.line_id)?;
        data.write_string(row, 2, &r.name)?;
        data.write_string(row, 3, &r.role)?;
        if !r.remark.is_empty() {
            data.write_string(row, 4, &r.remark)?;
        }
        data.write_string(row, 5, &r.hold_type)?;
        if let Some(discipline) = &r.discipline {
            data.write_string(row, 6, discipline)?;
        }
        data.write_datetime_with_format(row, 7, &excel_datetime(r.created)?, &timestamp)?;
        data.write_boolean(row, 8, r.released)?;
        if let Some(released_at) = r.release_date {
            data.write_datetime_with_format(row, 10, &excel_datetime(released_at)?, &timestamp)?;
        }
        if let Some(size) = &r.model_size {
            data.write_string(row, 11, size)?;
        }
        if let Some(size) = r.ldt_size {
            data.write_number(row, 12, size)?;
        }
        if let Some(calc) = &r.stress_calc {
            data.write_string(row, 13, calc)?;
        }
    }

    workbook.save(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{HashMap, HashSet};

    fn rows() -> (SynthConfig, Vec<SynthRow>) {
        let cfg = SynthConfig::new(11, 300, 2000);
        let rows = generate(&cfg);
        (cfg, rows)
    }

    #[test]
    fn generation_is_deterministic() {
        let cfg = SynthConfig::new(11, 300, 2000);
        assert_eq!(generate(&cfg), generate(&cfg));
        assert_ne!(generate(&cfg), generate(&SynthConfig::new(12, 300, 2000)));
    }

    #[test]
    fn produces_requested_volume_with_unique_ids() {
        let (cfg, rows) = rows();
        assert_eq!(rows.len(), cfg.holds);
        let ids: HashSet<i64> = rows.iter().map(|r| r.id).collect();
        assert_eq!(ids.len(), rows.len());
        let lines: HashSet<&str> = rows.iter().map(|r| r.line_id.as_str()).collect();
        assert!(lines.len() <= cfg.lines);
        assert!(lines.len() > cfg.lines / 2);
    }

    #[test]
    fn reproduces_real_quirks() {
        let (_, rows) = rows();
        assert!(
            rows.iter().any(|r| r.discipline.is_none()),
            "blank disciplines"
        );
        assert!(
            rows.iter().any(|r| r.remark.ends_with('\n')),
            "trailing line break"
        );
        assert!(
            rows.iter().any(|r| r.remark.contains("_x000D_")),
            "escaped carriage return"
        );
        assert!(rows.iter().any(|r| r.ldt_size == Some(0.0)), "zero size");
        assert!(rows.iter().any(|r| r.released) && rows.iter().any(|r| !r.released));

        let mut by_time: HashMap<NaiveDateTime, usize> = HashMap::new();
        for r in &rows {
            *by_time.entry(r.created).or_default() += 1;
        }
        assert!(
            by_time.values().any(|n| *n >= 5),
            "bulk rows share a timestamp"
        );
    }

    #[test]
    fn released_rows_have_a_release_date_after_creation_and_before_report() {
        let (cfg, rows) = rows();
        for r in &rows {
            assert!(r.created <= cfg.report_date);
            match (r.released, r.release_date) {
                (true, Some(d)) => assert!(d >= r.created && d <= cfg.report_date),
                (false, None) => {}
                other => panic!("inconsistent release state {other:?}"),
            }
        }
    }

    #[test]
    fn line_attributes_are_constant_per_line() {
        let (_, rows) = rows();
        let mut seen = HashMap::new();
        for r in &rows {
            let attrs = (&r.model_size, &r.ldt_size, &r.stress_calc);
            let first = seen.entry(r.line_id.as_str()).or_insert(attrs);
            assert_eq!(*first, attrs);
        }
    }

    #[test]
    fn writes_a_workbook() {
        let (cfg, rows) = rows();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("holds_synth.xlsx");
        write_workbook(&rows, &cfg, &path).unwrap();
        assert!(std::fs::metadata(&path).unwrap().len() > 10_000);
    }
}
