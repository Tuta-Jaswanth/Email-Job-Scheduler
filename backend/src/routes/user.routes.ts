import {Router} from 'express';import {auth} from '../middleware/auth';const r=Router();r.get('/me',auth,(req:any,res)=>res.json(req.user));export default r;
