import { StaticWebsite } from '@cloudcomponents/cdk-static-website';
import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { ReefGuideFrontendConfig } from '../infraConfig';

/**
 * Properties for the ReefGuideFrontend construct
 */
export interface ReefGuideFrontendProps {
  /** Fully qualified domain name */
  domainName: string;
  /** The Hosted Zone to produce record in */
  hz: route53.IHostedZone;
  /** The DNS certificate to use for CloudFront */
  usEastCertificate: acm.ICertificate;
  /** The configuration object for the ReefGuideFrontend service */
  config: ReefGuideFrontendConfig;
  /** CSP entries and endpoints */
  cspEntries: string[];
}

/**
 * Construct for the ReefGuideFrontend service
 */
export class ReefGuideFrontend extends Construct {
  /** The S3 bucket used for static file hosting */
  public readonly bucket: s3.Bucket;

  /** The CloudFront distribution */
  public readonly distribution: cloudfront.Distribution;

  /** The full domain name */
  public readonly endpoint: string;

  constructor(scope: Construct, id: string, props: ReefGuideFrontendProps) {
    super(scope, id);

    const website = new StaticWebsite(this, 'website', {
      hostedZone: props.hz,
      domainNames: [props.domainName],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(300),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          ttl: cdk.Duration.seconds(300),
          responsePagePath: '/index.html',
        },
      ],
      certificate: props.usEastCertificate,
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          // enable connection to the various API services needed
          contentSecurityPolicy: `connect-src 'self' ${props.cspEntries.join(
            ' ',
          )}`,
          override: true,
        },
      },
    });

    // outputs/properties
    this.bucket = website.bucket;
    this.distribution = website.distribution;
    this.endpoint = `https://${props.domainName}`;

    // Output the bucket name
    new cdk.CfnOutput(this, 'frontend-bucket-name', {
      value: this.bucket.bucketName,
      description: 'Name of the S3 bucket used for website content',
    });

    // Output the CloudFront URL
    new cdk.CfnOutput(this, 'distribution-url', {
      value: this.distribution.distributionDomainName,
      description: 'URL of the CloudFront distribution',
    });

    // Output the user URL
    new cdk.CfnOutput(this, 'website-url', {
      value: this.endpoint,
      description: 'URL of the website',
    });
  }
}
