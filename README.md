# Hold Explorer

Desktop app that reads the PlantIM "holds" export, shows which piping lines are on hold and why, tracks changes between exports, and recommends which blockers to solve first.

Status: early development. The design is in `docs/superpowers/specs/`.

## Development

    cargo test --workspace

The parity test needs Node.js on the PATH.

## Data policy

Real project files never enter this repository. Tests generate synthetic workbooks at run time with `hx-synth`.

## License

MIT
