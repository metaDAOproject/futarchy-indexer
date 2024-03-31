import { Counter } from "@lukasdeco/prom-client";
export class Logger {
  private errorCounter;
  private warnCounter;

  constructor() {
    this.errorCounter = new Counter({
      name: "errors",
      help: "number of errors",
    });

    this.warnCounter = new Counter({
      name: "warnings",
      help: "number of warnings",
    });
  }

  log(message: string): void {
    console.log(message);
  }

  info(message: string): void {
    console.info(message);
  }

  error(message: string): void {
    console.error(message);
    this.errorCounter.inc();
  }

  warn(message: string): void {
    console.warn(message);
    this.warnCounter.inc();
  }
}

// TODO: add lint rule preventing default exports (default exports are antithetical to IDE auto refactors)
export const logger = new Logger();
