const Joi = require('joi');
const monitorService = require('../services/monitor.service');
const checkerService = require('../services/checker.service');

const createSchema = Joi.object({
  name:            Joi.string().max(100).required(),
  url:             Joi.string().uri().required(),
  method:          Joi.string().valid('GET','POST','PUT','PATCH','DELETE','HEAD').default('GET'),
  intervalSec:     Joi.number().integer().min(30).max(86400).default(60),
  timeoutMs:       Joi.number().integer().min(500).max(30000).default(5000),
  expectedStatus:  Joi.number().integer().min(100).max(599).default(200),
  headers:         Joi.object().default({}),
  body:            Joi.string().optional(),
  alertThreshold:  Joi.number().integer().min(1).max(20).default(3),
});

exports.create = async (req, res, next) => {
  try {
    const { error, value } = createSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    const monitor = await monitorService.create({ ...value, userId: req.user.id });
    res.status(201).json(monitor);
  } catch (err) { next(err); }
};

exports.list = async (req, res, next) => {
  try {
    const monitors = await monitorService.listForUser(req.user.id);
    res.json({ monitors });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const monitor = await monitorService.getById(req.params.id, req.user.id);
    if (!monitor) return res.status(404).json({ error: 'Not found' });
    res.json(monitor);
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const monitor = await monitorService.update(req.params.id, req.user.id, req.body);
    res.json(monitor);
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    await monitorService.delete(req.params.id, req.user.id);
    res.status(204).end();
  } catch (err) { next(err); }
};

exports.getStats = async (req, res, next) => {
  try {
    const stats = await checkerService.getStats(req.params.id);
    res.json(stats);
  } catch (err) { next(err); }
};

exports.getHistory = async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const history = await checkerService.getHistory(req.params.id, req.user.id, limit, offset);
    res.json({ history, limit, offset });
  } catch (err) { next(err); }
};

// Trigger an immediate one-off check
exports.checkNow = async (req, res, next) => {
  try {
    const monitor = await monitorService.getById(req.params.id, req.user.id);
    if (!monitor) return res.status(404).json({ error: 'Not found' });
    const result = await checkerService.check(monitor);
    res.json(result);
  } catch (err) { next(err); }
};
