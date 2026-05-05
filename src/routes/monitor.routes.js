const router  = require('express').Router();
const ctrl    = require('../controllers/monitor.controller');
const auth    = require('../middlewares/authenticate');

router.use(auth);

router.get ('/',                ctrl.list);
router.post('/',                ctrl.create);
router.get ('/:id',             ctrl.getOne);
router.patch('/:id',            ctrl.update);
router.delete('/:id',           ctrl.remove);
router.get ('/:id/stats',       ctrl.getStats);
router.get ('/:id/history',     ctrl.getHistory);
router.post('/:id/check-now',   ctrl.checkNow);

module.exports = router;
