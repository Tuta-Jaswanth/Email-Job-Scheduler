"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const r = (0, express_1.Router)();
r.get('/me', auth_1.auth, (req, res) => res.json(req.user));
exports.default = r;
