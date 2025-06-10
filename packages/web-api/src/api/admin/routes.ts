import express, { Response } from 'express';
import { passport } from '../auth/passportConfig';
import { assertUserIsAdminMiddleware } from '../auth/utils';
import { z } from 'zod';
import { processRequest } from 'zod-express-middleware';
import {
  DescribeServicesCommand,
  ECSClient,
  UpdateServiceCommand,
} from '@aws-sdk/client-ecs';
import { InternalServerError } from '../exceptions';
import { config } from '../config';
import { initialiseAdmins } from '../initialise';

require('express-async-errors');
export const router = express.Router();

// Initialize ECS client
const ecsClient = new ECSClient({ region: config.aws.region });

// Require admin middleware

// To scale the cluster
export const PostScaleClusterInputSchema = z.object({
  desiredCount: z.number().min(0).max(10),
});
export type PostScaleClusterInput = z.infer<typeof PostScaleClusterInputSchema>;

// To get cluster current node count
export const GetClusterCountResponseSchema = z.object({
  runningCount: z.number().optional(),
  pendingCount: z.number().optional(),
  desiredCount: z.number().optional(),
  deployments: z.array(
    z.object({
      status: z.string(),
      taskDefinition: z.string(),
      desiredCount: z.number().optional(),
      pendingCount: z.number().optional(),
      runningCount: z.number().optional(),
      failedTasks: z.number().optional(),
      rolloutState: z.string().optional(),
      rolloutStateReason: z.string().optional(),
    }),
  ),
  events: z
    .array(
      z.object({
        createdAt: z.date(),
        message: z.string(),
      }),
    )
    .max(5), // Limiting to last 5 events
  serviceStatus: z.string().optional(),
});
export type GetClusterCountResponse = z.infer<
  typeof GetClusterCountResponseSchema
>;

/**
 * Configure the compute cluster to scale to the specified count.
 */
router.post(
  '/scale',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  processRequest({
    body: PostScaleClusterInputSchema,
  }),
  async (req, res) => {
    const { desiredCount } = req.body;
    try {
      const command = new UpdateServiceCommand({
        cluster: config.aws.ecs.clusterName,
        service: config.aws.ecs.serviceName,
        desiredCount,
      });
      await ecsClient.send(command);
      res.status(200).send();
    } catch (error) {
      throw new InternalServerError(
        'Failed to scale ECS service. Error: ' + error,
        error as Error,
      );
    }
  },
);

/**
 * Get the current status of the service in the cluster, exposing each of the
 * status counts.
 */
router.get(
  '/status',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  async (req, res: Response<GetClusterCountResponse>) => {
    try {
      const command = new DescribeServicesCommand({
        cluster: config.aws.ecs.clusterName,
        services: [config.aws.ecs.serviceName],
      });

      const response = await ecsClient.send(command);

      if (!response.services || response.services.length === 0) {
        throw new InternalServerError('Service not found');
      }

      const service = response.services[0];

      // Transform deployments data
      const deployments =
        service.deployments?.map(deployment => ({
          status: deployment.status || 'UNKNOWN',
          taskDefinition: deployment.taskDefinition || 'UNKNOWN',
          desiredCount: deployment.desiredCount,
          pendingCount: deployment.pendingCount,
          runningCount: deployment.runningCount,
          failedTasks: deployment.failedTasks,
          rolloutState: deployment.rolloutState,
          rolloutStateReason: deployment.rolloutStateReason,
        })) || [];

      // Transform events data
      const events =
        service.events?.slice(0, 5).map(event => ({
          createdAt: event.createdAt || new Date(),
          message: event.message || '',
        })) || [];

      res.json({
        // Primary counts
        runningCount: service.runningCount,
        pendingCount: service.pendingCount,
        desiredCount: service.desiredCount,
        // Deployment information
        deployments,
        // Recent events
        events,
        // Overall service status
        serviceStatus: service.status,
      });
    } catch (error) {
      throw new InternalServerError(
        'Failed to describe ECS service. Error: ' + error,
        error as Error,
      );
    }
  },
);

router.post(
  '/redeploy',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  async (req, res) => {
    try {
      const command = new UpdateServiceCommand({
        cluster: config.aws.ecs.clusterName,
        service: config.aws.ecs.serviceName,
        // Force an update
        forceNewDeployment: true,
        // Maintain the current desired count
        deploymentConfiguration: {
          // Allows rolling updates
          minimumHealthyPercent: 50,
          // Allows new tasks to start before old ones stop
          maximumPercent: 200,
        },
      });

      await ecsClient.send(command);
      res.status(200).send();
    } catch (error) {
      throw new InternalServerError(
        'Failed to initiate redeployment. Error ' + error,
        error as Error,
      );
    }
  },
);

/**
 * Forces the DB to perform its seed initialisation
 */
router.get(
  '/init',
  passport.authenticate('jwt', { session: false }),
  assertUserIsAdminMiddleware,
  async (req, res) => {
    // if the user is admin, allow forceful re-init in case of out of date admin
    // or other service creds
    await initialiseAdmins();
    res.status(200).send();
    return;
  },
);
