//! Build script of the desktop crate: runs `tauri-build`, and on Windows embeds the application
//! manifest into every target of the crate, the test executables included.

use std::path::PathBuf;

/// The application manifest for Windows, beside this file: the one `tauri-build` uses by default.
/// It asks for version 6 of the common controls.
const WINDOWS_MANIFEST: &str = "windows-app-manifest.xml";

fn main() {
    let target = |name: &str| std::env::var(name).unwrap_or_default();
    let msvc =
        target("CARGO_CFG_TARGET_OS") == "windows" && target("CARGO_CFG_TARGET_ENV") == "msvc";

    // `tauri-build` puts its manifest into the resources of the binary targets only. A test
    // executable links the Tauri runtime as well, and the runtime imports a function that only
    // version 6 of the common controls has, so without the manifest Windows refuses to start the
    // tests (STATUS_ENTRYPOINT_NOT_FOUND). With the MSVC linker the manifest is therefore left
    // out of the resources and embedded by the linker into every target, as Tauri does for its
    // own tests. Every other target keeps what `tauri-build` does by default.
    let windows = if msvc {
        tauri_build::WindowsAttributes::new_without_app_manifest()
    } else {
        tauri_build::WindowsAttributes::new()
    };
    let attributes = tauri_build::Attributes::new().windows_attributes(windows);
    if let Err(error) = tauri_build::try_build(attributes) {
        println!("{error:#}");
        std::process::exit(1);
    }

    if msvc {
        let manifest = PathBuf::from(target("CARGO_MANIFEST_DIR")).join(WINDOWS_MANIFEST);
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    }
}
