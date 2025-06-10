import {CfnOutput, RemovalPolicy} from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import {Construct} from 'constructs';

export interface DbProps {
  /** The VPC in which to create the DB */
  vpc: ec2.IVpc;
  /** How large is the instance? */
  instanceSize?: ec2.InstanceSize;
  /** How many GB allocated? */
  storageGb?: number;
}

export class Db extends Construct {
  public readonly credsArn: string;

  public readonly arn: string;

  public readonly endpoint: rds.Endpoint;

  public readonly databaseId: string;

  constructor(scope: Construct, id: string, props: DbProps) {
    super(scope, id);

    // Manually construct an sg to allow 5432 port inbound access
    const sg = new ec2.SecurityGroup(this, 'db-sg', {
      vpc: props.vpc,
      allowAllOutbound: true,
      description: 'Provides port 5432 access for DB',
    });
    sg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      'Allows 5432 inbound access for psql',
    );

    // Create the RDS instance
    const instance = new rds.DatabaseInstance(this, 'instance', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_4,
      }),
      vpc: props.vpc,
      securityGroups: [sg],
      // Create a default DB for this application
      databaseName: 'reefguide',
      allocatedStorage: props.storageGb ?? 50,
      // Major version migrations are not needed
      allowMajorVersionUpgrade: false,
      // This can cause issues when version mismatches from schema
      autoMinorVersionUpgrade: false,
      // Automatically build a password
      credentials: rds.Credentials.fromGeneratedSecret('reefguide'),
      // We don't want IAM authentication for now - just use user/pass so it's
      // easy for non AWS staff to manage the DB
      // TODO consider security implications here
      iamAuthentication: false,
      // T4G small by default
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        props.instanceSize ?? ec2.InstanceSize.SMALL,
      ),
      // This makes managing the DB through Prisma etc much easier but has
      // security implications - particularly in combination with disabling iam Authentication
      publiclyAccessible: true,
      // Place into public subnet
      vpcSubnets: {subnetType: ec2.SubnetType.PUBLIC},
      // Take a snapshot upon removal
      removalPolicy: RemovalPolicy.SNAPSHOT,
      // Storage encryption - enable
      storageEncrypted: true,
    });

    // Outputs
    this.credsArn = instance.secret?.secretArn ?? 'unknown';
    this.arn = instance.instanceArn;
    this.endpoint = instance.instanceEndpoint;
    this.databaseId = instance.instanceIdentifier;

    new CfnOutput(this, 'dbinfo', {
      value: JSON.stringify({
        creds: instance.secret?.secretArn ?? 'unknown',
        arn: instance.instanceArn,
        endpoint: instance.instanceEndpoint,
        id: instance.instanceIdentifier,
      }),
    });
  }
}
