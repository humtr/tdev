use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.as_slice() {
        [arg] if arg == "--version" => println!("tdev {}", tdev::VERSION),
        [arg] if arg == "--help" => println!("Usage: tdev --version | --help"),
        _ => {
            eprintln!("Unsupported command; use tdev --help");
            return ExitCode::from(2);
        }
    }
    ExitCode::SUCCESS
}
