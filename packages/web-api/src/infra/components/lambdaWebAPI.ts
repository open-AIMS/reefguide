import * as cdk from 'aws-cdk-lib';
import {
  aws_apigateway as apigateway,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  aws_secretsmanager as sm,
  aws_iam as iam,
} from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as r53 from 'aws-cdk-lib/aws-route53';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import {Construct} from 'constructs';
import {WebAPIConfig} from '../infraConfig';

/**
 * Properties for the WebAPI construct
 */
export interface LambdaWebAPIProps {
  // Fully qualified domain name
  domainName: string;
  /** The Hosted Zone to produce record in */
  hz: r53.IHostedZone;
  /** The DNS certificate to use for API Gateway */
  certificate: acm.ICertificate;
  /** The configuration object for the web api service */
  config: WebAPIConfig;
  /** The name of the ECS cluster service which hosts the Julia compute nodes */
  ecsClusterName: string;
  /** The name of the ECS service which hosts the Julia compute nodes */
  ecsServiceName: string;
  /** Creds to initialise for the manager and worker services */
  managerCreds: sm.Secret;
  workerCreds: sm.Secret;
  adminCreds: sm.Secret;
}

/**
 * Construct for the web api service
 */
export class LambdaWebAPI extends Construct {
  /** Internal port for the Web API service */
  public readonly internalPort: number;

  /** External HTTPS port for the Web API service */
  public readonly externalPort: number = 443;

  /** Endpoint for Web API access (format: https://domain:port) */
  public readonly endpoint: string;

  /** The underlying lambda function */
  public readonly lambda: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaWebAPIProps) {
    super(scope, id);

    const config = props.config;
    const lambdaConfig = props.config.mode.lambda;

    if (lambdaConfig === undefined) {
      cdk.Annotations.of(this).addError(
        'You cannot deploy a lambda web API without providing the lambda mode configuration',
      );
      throw new Error(
        'You cannot deploy a lambda web API without providing the lambda mode configuration',
      );
    }

    // OUTPUTS
    // ================

    // Build the public URL and expose
    this.internalPort = props.config.port;
    this.endpoint = `https://${props.domainName}`;

    // ==================
    // Web API deployment
    // ==================

    const apiSecrets = sm.Secret.fromSecretCompleteArn(
      this,
      'db-creds',
      config.apiSecretsArn,
    );

    // ===========
    // Lambda mode
    // ===========

    const paramsAndSecrets = lambda.ParamsAndSecretsLayerVersion.fromVersion(
      lambda.ParamsAndSecretsVersions.V1_0_103,
      {
        cacheSize: 500,
        logLevel: lambda.ParamsAndSecretsLogLevel.DEBUG,
      },
    );

    // Use the Node JS L3 stack to help esbuild/bundle the Node function see
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_nodejs-readme.html
    this.lambda = new nodejs.NodejsFunction(this, 'api', {
      entry: 'src/infra/lambda.ts',
      handler: 'handler',
      environment: {
        PORT: String(this.internalPort),
        NODE_ENV: config.nodeEnv,
        // This contains the database connection strings, as well as the JWT
        // info
        API_SECRETS_ARN: config.apiSecretsArn,
        WORKER_CREDS_ARN: props.workerCreds.secretArn,
        MANAGER_CREDS_ARN: props.managerCreds.secretArn,
        ADMIN_CREDS_ARN: props.adminCreds.secretArn,
        // Fully qualified domain for API domain - this defines the JWT iss
        API_DOMAIN: this.endpoint,
        ECS_CLUSTER_NAME: props.ecsClusterName,
        ECS_SERVICE_NAME: props.ecsServiceName,
      },
      timeout: cdk.Duration.seconds(30),
      bundling: {
        esbuildArgs: {
          // This tells esbuild how to handle the imports of the prisma schema
          // and the necesary libraries
          '--loader:.prisma': 'file',
          '--loader:.so.node': 'file',
          // Include assets as their exact name - then prisma can pick it up
          '--asset-names': '[name]',
        },
      },
      paramsAndSecrets,
    });

    // Create an API Gateway REST API
    const restApi = new apigateway.RestApi(this, 'apigw', {
      restApiName: 'Reefguide Web API',
      description: 'This service serves the Reefguide Web API.',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
      // Include certs
      domainName: {
        domainName: props.domainName,
        certificate: props.certificate,
      },
    });

    // Create an API Gateway Lambda Integration
    const lambdaIntegration = new apigateway.LambdaIntegration(this.lambda);

    // Add a root resource and method - proxy through all routes
    const rootResource = restApi.root.addResource('{proxy+}');
    rootResource.addMethod('ANY', lambdaIntegration, {
      // no auth - app handles this
      authorizationType: apigateway.AuthorizationType.NONE,
    });

    // allow read of db secrets
    apiSecrets.grantRead(this.lambda);

    // Initialisation creds
    props.managerCreds.grantRead(this.lambda);
    props.workerCreds.grantRead(this.lambda);
    props.adminCreds.grantRead(this.lambda);

    // Add a route to the API gateway URL on hosted zone at configured domain
    new route53.ARecord(this, 'route', {
      zone: props.hz,
      target: route53.RecordTarget.fromAlias(new targets.ApiGateway(restApi)),
      recordName: props.domainName,
    });

    // Output the URL of the API
    new cdk.CfnOutput(this, 'web-api-url', {
      value: this.endpoint,
      description: 'Web REST API endpoint',
    });
  }

  /**
   * Registers an ECS service with this API by granting the necessary permissions
   * to the Lambda function to manage the service
   * @param service The ECS Fargate service to register
   */
  public registerCluster(service: ecs.FargateService) {
    // Create a policy that allows the Lambda to describe and update the ECS service
    const ecsPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        // Permissions to get service status
        'ecs:DescribeServices',
        'ecs:ListServices',
        // Permissions to modify service
        'ecs:UpdateService',
      ],
      // Scope the permissions to just this specific service and its cluster
      resources: [service.serviceArn, service.cluster.clusterArn],
    });

    // Add the policy to the Lambda's role
    this.lambda.addToRolePolicy(ecsPolicy);
  }

  public addEnv(key: string, val: string): void {
    this.lambda.addEnvironment(key, val);
  }
}
