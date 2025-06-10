/**
 * Core identifiers and metadata for an ECS Fargate task
 */
export interface TaskIdentifiers {
  taskId: string;
  taskArn: string;
  clusterArn: string;
  taskFamily: string;
  taskRevision: number;
  availabilityZone: string;
}

/**
 * Shape of the metadata response from ECS Task Metadata Endpoint V4
 */
interface TaskMetadataResponse {
  TaskARN: string;
  Family: string;
  Revision: number;
  Cluster: string;
  AvailabilityZone: string;
}

/**
 * Retrieves identifiers and metadata for the current ECS Fargate task.
 * Uses the ECS Task Metadata Endpoint V4 to fetch task information.
 *
 * @returns Promise<TaskIdentifiers> Object containing task metadata and identifiers
 * @throws Error if metadata cannot be retrieved or parsed
 *
 * @example
 * try {
 *   const metadata = await getTaskMetadata();
 *   console.log(`Running in task: ${metadata.taskId}`);
 * } catch (error) {
 *   console.error('Failed to get metadata:', error);
 * }
 */
export async function getTaskMetadata(): Promise<TaskIdentifiers> {
  const metadataUri = process.env.ECS_CONTAINER_METADATA_URI_V4;
  if (!metadataUri) {
    throw new Error('Not running in ECS environment - metadata URI not found');
  }

  try {
    const response = await fetch(`${metadataUri}/task`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const taskMetadata = (await response.json()) as TaskMetadataResponse;

    // Quick validation of critical fields
    if (!taskMetadata.TaskARN) {
      throw new Error('Invalid metadata response: missing required fields');
    }

    return {
      taskId: taskMetadata.TaskARN.split('/').pop() ?? 'unknown',
      taskArn: taskMetadata.TaskARN,
      clusterArn: taskMetadata.Cluster,
      taskFamily: taskMetadata.Family,
      taskRevision: taskMetadata.Revision,
      availabilityZone: taskMetadata.AvailabilityZone,
    };
  } catch (error) {
    throw new Error(
      `Failed to retrieve ECS task metadata: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}

/**
 * Safely attempts to get task metadata with fallback values.
 * Won't throw errors - returns empty object if metadata can't be retrieved.
 *
 * @returns Promise<Partial<TaskIdentifiers>> Metadata object with potentially missing fields
 */
export async function getTaskMetadataSafe(): Promise<Partial<TaskIdentifiers>> {
  try {
    return await getTaskMetadata();
  } catch (error) {
    console.warn('Failed to get task metadata:', error);
    return {};
  }
}
