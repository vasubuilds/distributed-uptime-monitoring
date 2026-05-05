// routes/auth.routes.js
const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
router.post('/register', ctrl.register);
router.post('/login',    ctrl.login);
module.exports = router;
