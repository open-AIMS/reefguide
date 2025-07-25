import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { router as adminRoutes } from './admin/routes';
import { getJwks } from './auth/jwtUtils';
import { passport } from './auth/passportConfig';
import { router as authRoutes } from './auth/routes';
import { router as jobRoutes } from './jobs/routes';
import * as middlewares from './middlewares';
import { router as noteRoutes } from './notes/routes';
import { router as polygonRoutes } from './polygons/routes';
import { router as userRoutes } from './users/routes';
import { router as projectRoutes } from './projects/routes';

require('dotenv').config();
require('express-async-errors');

// Setup app
const app: Express = express();

// Helmet and middleware
app.use(morgan('dev'));
app.use(helmet());
app.use(cors());
app.use(express.json());

// Passport authentication
app.use(passport.initialize());

// Setup the /api sub router
const api = express.Router();

// jwks.json wkt endpoint
api.get('/.well-known/jwks.json', (req, res) => {
  res.json(getJwks());
});

/** Health check GET route */
api.get('/', (req, res) => {
  res
    .json({
      message: 'API healthy.'
    })
    .send();
});

// Passport auth routes
api.use('/auth', authRoutes);
api.use('/polygons', polygonRoutes);
api.use('/notes', noteRoutes);
api.use('/admin', adminRoutes);
api.use('/users', userRoutes);
api.use('/jobs', jobRoutes);
api.use('/projects', projectRoutes);

// API base router
app.use('/api', api);

// Passes status code from custom exceptions through to error response
app.use(middlewares.errorMiddleware);

export default app;
