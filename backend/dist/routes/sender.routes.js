"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../config/db");
const env_1 = require("../config/env");
const router = (0, express_1.Router)();
router.get('/', auth_1.auth, async (req, res) => {
    const user = req.user;
    // Clean up any legacy dummy oliver brown sender
    await db_1.prisma.sender.deleteMany({
        where: { email: 'oliver.brown@domain.io' },
    }).catch(() => { });
    let userSender = null;
    // Ensure current user has a sender entry configured with SMTP credentials
    if (user?.email) {
        userSender = await db_1.prisma.sender
            .upsert({
            where: { email: user.email },
            update: {
                name: user.name,
                etherealUser: env_1.env.etherealUser,
                etherealPass: env_1.env.etherealPass,
            },
            create: {
                email: user.email,
                name: user.name,
                etherealUser: env_1.env.etherealUser,
                etherealPass: env_1.env.etherealPass,
            },
            select: { id: true, email: true, name: true },
        })
            .catch(() => null);
    }
    // Return only the owner's sender account
    const senders = await db_1.prisma.sender.findMany({
        where: {
            email: user?.email ? user.email : { not: 'oliver.brown@domain.io' },
        },
        select: { id: true, email: true, name: true },
        orderBy: { createdAt: 'asc' },
    });
    return res.json(senders.length > 0 ? senders : userSender ? [userSender] : []);
});
exports.default = router;
