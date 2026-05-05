const router = require('express').Router();
const auth   = require('../middlewares/authenticate');
const alertService = require('../services/alert.service');

router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const alerts = await alertService.listAlerts(req.user.id, limit, offset);
    const unread = await alertService.getUnreadCount(req.user.id);
    res.json({ alerts, unread, limit, offset });
  } catch (err) { next(err); }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    await alertService.markRead(req.params.id, req.user.id);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
