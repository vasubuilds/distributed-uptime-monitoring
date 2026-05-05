const router = require('express').Router();
const auth   = require('../middlewares/authenticate');
const ctrl   = require('../controllers/report.controller');

router.use(auth);

router.get('/summary',                ctrl.summary);
router.get('/:monitorId/uptime',      ctrl.uptimeReport);
router.get('/:monitorId/incidents',   ctrl.incidentLog);

module.exports = router;
