import { Logger, logger as baseLogger } from "./logger";
import { Err, Ok, Result, ErrEnum } from "./result";

export type IntervalId = ReturnType<typeof setInterval>;

export enum StopErrorType {
  JobAlreadyStopped = 'JobAlreadyStopped',
  ClearIntervalError = 'ClearIntervalError'
}

export type StopError =
  {
    type: StopErrorType.JobAlreadyStopped;
  } |
  {
    type: StopErrorType.ClearIntervalError;
    error: Error;
  };

export enum StartErrorType {
  TryingToRunDaemonJob = 'TryingToRunDaemonJob',
  JobAlreadyStarted = 'JobAlreadyStarted',
  InitFailed = 'InitFailed',
  DoJobFailed = 'DoJobFailed'
}

export type StartError<JobError extends ErrEnum> = 
  {
    type: StartErrorType.TryingToRunDaemonJob;
  } |
  {
    type: StartErrorType.JobAlreadyStarted;
    pollingIntervalId: IntervalId;
  } |
  {
    type: StartErrorType.InitFailed;
    jobError: JobError;
  } |
  {
    type: StartErrorType.DoJobFailed;
    jobError: JobError
  };

// Used in the case of the parent job which
// spawns all child instances
export const NO_OP_JOB = "NO_OP_JOB";

export abstract class BackgroundJob<DoJobError extends ErrEnum> {
  public readonly id: string;
  public readonly logger: Logger;
  private pollerIntervalId: IntervalId | undefined;
  private readonly interval: number;
  private readonly initTask: Promise<Result<true, DoJobError>>;
  public constructor(attrs?: 
    {
      interval: number; 
      id: string;
    }) {
      if (attrs === undefined) {
        this.interval = -1;
        this.id = NO_OP_JOB;
        this.logger = baseLogger.child(`[${this.constructor.name} daemon] `);
        this.initTask = Promise.resolve(Ok(true));
      } else {
        const {id, interval} = attrs;
        this.interval = interval;
        this.id = id;
        this.logger = baseLogger.child(`[job ${this.id}] `);
        this.initTask = this.init();
      }
    }

  public stopped(): boolean {
    return this.pollerIntervalId === undefined;
  }

  public async start(): Promise<Result<true, StartError<DoJobError>>> {
    if (this.id === NO_OP_JOB) {
      return Err({type: StartErrorType.TryingToRunDaemonJob});
    }
    const initResult = await this.initTask;
    if (!initResult.success) {
      this.logger.error(`failed to initialize due to ${
        JSON.stringify(initResult.error)}`);
      return Err({
        type: StartErrorType.InitFailed,
        jobError: initResult.error
      });
    }
    if (!this.stopped()) {
      const intervalId: IntervalId = this.pollerIntervalId!;
      this.logger.error(
        `Error: job already started with interval ${
          intervalId
        }`
      );
      return Err({ 
        type: StartErrorType.JobAlreadyStarted,
        pollingIntervalId: intervalId
      });
    }
    let jobRun = 0;
    const job = async () => {
      jobRun++;
      const result = await this.doJob();
      if (!result.success) {
        const {error} = result
        this.logger.error(
          `Error: failed job ${jobRun} due to ${JSON.stringify(error)}`
        );
      }
      return result;
    }
    this.logger.info(`started`);
    let running = true;
    const firstRun = await job();
    running = false;
    if (!firstRun.success) {
      return Err({
        type: StartErrorType.DoJobFailed,
        jobError: firstRun.error
      });
    }
    this.pollerIntervalId = setInterval(async () => {
      if (running || this.stopped()) return;
      running = true;
      const result = await job();
      running = false;
      if (!result.success) {
        const stopResult = await this.stop();
        if (!stopResult.success) {
          this.logger.error(`stop failed. crashing program. error: ${
            stopResult.error.toString()
          }`);
          process.exit(1);
        }
      }
    }, this.interval);
    return Ok(true);
  }

  public async stop(): Promise<Result<true, StopError>> {
    if (this.stopped()) {
      return Err({
        type: StopErrorType.JobAlreadyStopped
      });
    }
    try {
      clearInterval(this.pollerIntervalId);
      this.pollerIntervalId = undefined;
    } catch(e) {
      return Err({
        type: StopErrorType.ClearIntervalError,
        error: e as Error
      })
    }
    this.logger.info(`stopped`);
    return Ok(true);
  }

  public abstract init(): Promise<Result<true, DoJobError>>;

  public abstract doJob(): Promise<Result<true, DoJobError>>;

  public abstract getIntendedJobs(): Promise<this[]>;

  private allStarted = false;

  public startAll() {
    if (this.id !== NO_OP_JOB) {
      this.logger.error(`Can only call startAll on daemon type`);
      process.exit(1);
    }
    const jobType = this.constructor.name;
    if (this.allStarted) {
      this.logger.info(`All ${jobType} jobs already started`);
      return;
    }
    this.allStarted = true;
    const runningJobs: Record<string, this> = {};
    let updatingJobs = false;
    const updateJobs = async () => {
      const intendedJobs = await this.getIntendedJobs();
      const intendedJobsById: Record<string, this> = {};
      const jobsToStart: Set<string> = new Set();
      const jobsToStop: Set<string> = new Set();
      for (const job of intendedJobs) {
        intendedJobsById[job.id] = job;
        const alreadyRunning = job.id in runningJobs;
        if (!alreadyRunning) {
          jobsToStart.add(job.id);
        }
      }
      for (const jobId in runningJobs) {
        if (!(jobId in intendedJobsById)) {
          jobsToStop.add(jobId);
        }
      }
      if (jobsToStop.size) {
        this.logger.info(`Stopping ${jobsToStop.size} ${jobType} jobs:`);
        let i = 0;
        for (const jobId of jobsToStop) {
          this.logger.info(` ${++i}. ${jobType} ${jobId}`);
          const stopResult = await runningJobs[jobId].stop();
          if (stopResult.success) {
            delete runningJobs[jobId];
          } else {
            this.logger.error(`Failed to stop job ${jobType} ${jobId}`);
            continue;
          }
        }
      }
      if (jobsToStart.size) {
        this.logger.info(`Starting ${jobsToStart.size} ${jobType} jobs:`);
        let i = 0;
        for (const jobId of jobsToStart) {
          this.logger.info(` ${++i}. ${jobType} ${jobId}`);
          const job = intendedJobsById[jobId];
          const startResult = await job.start();
          if (startResult.success) {
            runningJobs[jobId] = job;
          } else {
            this.logger.error(`Failed to start job ${jobType} ${jobId}`);
            continue;
          }
        }
      }
      updatingJobs = false;
    }
    setInterval(() => {
      if (!updatingJobs) {
        updateJobs();
      }
    }, 5000);
    updateJobs();
  }
}
