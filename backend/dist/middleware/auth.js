"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = auth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const db_1 = require("../config/db");
const AUTH_COOKIE = 'reachinbox_auth';
async function auth(req, res, next) {
    const bearer = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.substring('Bearer '.length)
        : undefined;
    // Cookie is the normal browser path. Bearer is retained for API/Postman use.
    const token = req.signedCookies?.[AUTH_COOKIE] || req.cookies?.[AUTH_COOKIE] || bearer;
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret, {
            issuer: 'reachinbox-api',
            audience: 'reachinbox-web',
        });
        if (!payload.sub) {
            return res.status(401).json({ message: 'Invalid authentication token' });
        }
        const user = await db_1.prisma.user.findUnique({
            where: { id: payload.sub },
        });
        if (!user) {
            return res.status(401).json({ message: 'User no longer exists' });
        }
        req.user = user;
        return next();
    }
    catch {
        return res.status(401).json({ message: 'Invalid or expired authentication token' });
    }
}
