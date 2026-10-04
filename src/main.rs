use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.as_slice() {
        [arg] if arg == "--version" => println!("tdev {}", tdev::VERSION),
        [arg] if arg == "--help" => println!(
            "Usage: tdev --version | --help\n       tdev serve --state PATH --config PATH --port PORT --diagnostics off"
        ),
        [command, option, path] if command == "supervise" && option == "--job" => {
            if let Err(error) = tdev::supervisor::run(std::path::Path::new(path)) {
                eprintln!("Supervisor stopped without complete evidence: {error}");
                return ExitCode::from(2);
            }
        }
        [command, rest @ ..] if command == "serve" => {
            let run = || -> Result<(), Box<dyn std::error::Error>> {
                let mut options = std::collections::BTreeMap::new();
                let (pairs, remainder) = rest.as_chunks::<2>();
                for pair in pairs {
                    if !["--state", "--config", "--port", "--diagnostics"]
                        .contains(&pair[0].as_str())
                        || options.insert(pair[0].as_str(), pair[1].as_str()).is_some()
                    {
                        return Err("Invalid serve option".into());
                    }
                }
                if !remainder.is_empty() || options.get("--diagnostics") != Some(&"off") {
                    return Err("Explicit --diagnostics off is required".into());
                }
                let state = options.get("--state").ok_or("Missing --state")?;
                let config = options.get("--config").ok_or("Missing --config")?;
                let port = options
                    .get("--port")
                    .ok_or("Missing --port")?
                    .parse::<u16>()?;
                let app = std::sync::Arc::new(tdev::application::Application::open(
                    std::path::Path::new(state),
                    std::path::Path::new(config),
                )?);
                let runtime = tokio::runtime::Builder::new_multi_thread()
                    .worker_threads(2)
                    .max_blocking_threads(8)
                    .enable_all()
                    .build()?;
                runtime.block_on(tdev::transport::serve(app, port))?;
                Ok(())
            };
            if let Err(error) = run() {
                eprintln!("{error}");
                return ExitCode::from(2);
            }
        }
        _ => {
            eprintln!("Unsupported command; use tdev --help");
            return ExitCode::from(2);
        }
    }
    ExitCode::SUCCESS
}
