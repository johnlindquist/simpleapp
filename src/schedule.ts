import schedule, { Job } from 'node-schedule';

import log from 'electron-log';
import { scheduleMap } from './state';
import { processes } from './process';

import { Script } from './types';
import { ProcessType } from './enums';

export const cancelJob = (filePath: string) => {
  if (scheduleMap.has(filePath)) {
    log.info(`Unscheduling: ${filePath}`);
    const job = scheduleMap.get(filePath) as Job;
    job.cancel();
    scheduleMap.delete(filePath);
  }
};

export const cancelSchedule = (filePath: string) => {
  cancelJob(filePath);
};

export const scheduleScriptChanged = ({
  filePath,
  schedule: scheduleString,
}: Script) => {
  if (scheduleMap.get(filePath)) {
    cancelJob(filePath);
  }

  try {
    if (scheduleString) {
      // log.info(`Schedule string ${scheduleString}:${filePath}`);

      const job = schedule.scheduleJob(filePath, scheduleString, () => {
        processes.add(ProcessType.Schedule, filePath);
      });

      log.info(`Scheduling: ${filePath} for ${scheduleString}`);
      scheduleMap.set(filePath, job);
    }
  } catch (error) {
    log.warn(error.message);
  }
};