const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes    = require('./routes/auth.routes');
const monitorRoutes = require('./routes/monitor.routes');
const alertRoutes   = require('./routes/alert.routes');
const reportRoutes  = require('./routes/report.routes');
const errorHandler  = require('./middlewares/errorHandler');
const { metricsRoute, metricsMiddleware } = require('./utils/metrics');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));
app.use(metricsMiddleware);

app.use('/api/auth',     authRoutes);
app.use('/api/monitors', monitorRoutes);
app.use('/api/alerts',   alertRoutes);
app.use('/api/reports',  reportRoutes);
app.get('/metrics',      metricsRoute);
app.get('/health',       (_, res) => res.json({ status: 'ok', ts: new Date() }));

app.use(errorHandler);

module.exports = app;
