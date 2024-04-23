import { Counter } from "@lukasdeco/prom-client";
export class Logger {
  private readonly prefix;
  private readonly errorCounter;
  private readonly warnCounter;

  public constructor(prefix?: string) {
    this.errorCounter = new Counter({
      name: "errors",
      help: "number of errors",
    });

    this.warnCounter = new Counter({
      name: "warnings",
      help: "number of warnings",
    });

    this.prefix = prefix ?? '';
  }

  public log(message: string): void {
    console.log(this.prefix + message);
  }

  public info(message: string): void {
    console.info(this.prefix + message);
  }

  public error(message: string): void {
    console.error(this.prefix + message);
    this.errorCounter.inc();
  }

  public warn(message: string): void {
    console.warn(this.prefix + message);
    this.warnCounter.inc();
  }

  public child(prefix: string): Logger {
    return new Logger(`${this.prefix}${prefix}`);
  }
}

// TODO: add lint rule preventing default exports (default exports are antithetical to IDE auto refactors)
export const logger = new Logger();
