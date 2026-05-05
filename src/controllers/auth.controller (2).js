const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const schema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
});

exports.register = async (req, res, next) => {
  try {
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    const pool = getPool();
    const exists = await pool.query('SELECT 1 FROM users WHERE email=$1', [value.email]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email taken' });
    const id = uuidv4();
    const hash = await bcrypt.hash(value.password, 12);
    await pool.query('INSERT INTO users (id,email,password_hash) VALUES ($1,$2,$3)', [id, value.email, hash]);
    const token = jwt.sign({ id, email: value.email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, userId: id });
  } catch (err) { next(err); }
};

exports.login = async (req, res, next) => {
  try {
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    const pool = getPool();
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [value.email]);
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    if (!(await bcrypt.compare(value.password, user.password_hash)))
      return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId: user.id });
  } catch (err) { next(err); }
};
