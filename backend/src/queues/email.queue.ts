import {Queue} from 'bullmq';
import {queueConnection} from '../config/redis';
export const emailQueue=new Queue('email-send',{connection:queueConnection});
