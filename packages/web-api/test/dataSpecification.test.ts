import { JobStatus, JobType, prisma } from '@reefguide/db';
import app from '../src/apiSetup';
import { authRequest, clearDbs, userSetup } from './utils/testSetup';

describe('Data Specification Management', () => {
  beforeEach(async () => {
    await clearDbs();
    await userSetup();
  });

  describe('POST /api/admin/data-specification-update', () => {
    it('should create a data specification update job', async () => {
      const res = await authRequest(app, 'admin')
        .post('/api/admin/data-specification-update')
        .expect(200);

      expect(res.body).toHaveProperty('jobId');
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toContain('Data specification update job created successfully');

      // Verify job was created
      const job = await prisma.job.findUnique({
        where: { id: res.body.jobId }
      });
      expect(job?.type).toBe(JobType.DATA_SPECIFICATION_UPDATE);
      expect(job?.status).toBe(JobStatus.PENDING);
    });

    it('should return 401 for non-admin users', async () => {
      await authRequest(app, 'user1').post('/api/admin/data-specification-update').expect(401);
    });
  });

  describe('POST /api/admin/data-specification', () => {
    it('should create new criteria and regions', async () => {
      const res = await authRequest(app, 'admin')
        .post('/api/admin/data-specification')
        .send({
          regions: [
            {
              name: 'test_region',
              display_name: 'Test Region',
              description: 'A test region',
              criteria: [
                {
                  name: 'depth',
                  display_title: 'Depth Range',
                  units: 'meters',
                  payload_prefix: 'depth',
                  min_val: -50,
                  max_val: -2,
                  default_min_val: -30,
                  default_max_val: -5
                }
              ]
            }
          ]
        })
        .expect(200);

      expect(res.body.message).toContain('Data specification updated successfully');
      expect(res.body.updated.criteria_count).toBe(1);
      expect(res.body.updated.regions_count).toBe(1);
      expect(res.body.updated.regional_criteria_count).toBe(1);

      // Verify in database
      const region = await prisma.region.findUnique({
        where: { name: 'test_region' }
      });
      expect(region?.display_name).toBe('Test Region');

      const criteria = await prisma.criteria.findUnique({
        where: { name: 'depth' }
      });
      expect(criteria?.display_title).toBe('Depth Range');
    });

    it('should update existing criteria and regions', async () => {
      // Create initial data
      await authRequest(app, 'admin')
        .post('/api/admin/data-specification')
        .send({
          regions: [
            {
              name: 'test_region',
              display_name: 'Original Name',
              criteria: [
                {
                  name: 'depth',
                  display_title: 'Original Title',
                  units: 'meters',
                  payload_prefix: 'depth',
                  min_val: -40,
                  max_val: -3,
                  default_min_val: -25,
                  default_max_val: -10
                }
              ]
            }
          ]
        })
        .expect(200);

      // Update the data
      await authRequest(app, 'admin')
        .post('/api/admin/data-specification')
        .send({
          regions: [
            {
              name: 'test_region',
              display_name: 'Updated Name',
              criteria: [
                {
                  name: 'depth',
                  display_title: 'Updated Title',
                  units: 'meters',
                  payload_prefix: 'depth',
                  min_val: -60,
                  max_val: -1,
                  default_min_val: -35,
                  default_max_val: -3
                }
              ]
            }
          ]
        })
        .expect(200);

      // Verify updates
      const region = await prisma.region.findUnique({
        where: { name: 'test_region' }
      });
      expect(region?.display_name).toBe('Updated Name');

      const criteria = await prisma.criteria.findUnique({
        where: { name: 'depth' }
      });
      expect(criteria?.display_title).toBe('Updated Title');
    });

    it('should remove unused criteria and regions', async () => {
      // Create initial data with multiple items
      await authRequest(app, 'admin')
        .post('/api/admin/data-specification')
        .send({
          regions: [
            {
              name: 'region1',
              display_name: 'Region 1',
              criteria: [
                {
                  name: 'depth',
                  display_title: 'Depth',
                  units: 'meters',
                  payload_prefix: 'depth',
                  min_val: -50,
                  max_val: -2,
                  default_min_val: -30,
                  default_max_val: -5
                }
              ]
            },
            {
              name: 'region2',
              display_name: 'Region 2',
              criteria: [
                {
                  name: 'slope',
                  display_title: 'Slope',
                  units: 'degrees',
                  payload_prefix: 'slope',
                  min_val: 0,
                  max_val: 45,
                  default_min_val: 5,
                  default_max_val: 30
                }
              ]
            }
          ]
        })
        .expect(200);

      // Update with only one region and criteria
      await authRequest(app, 'admin')
        .post('/api/admin/data-specification')
        .send({
          regions: [
            {
              name: 'region1',
              display_name: 'Region 1 Only',
              criteria: [
                {
                  name: 'depth',
                  display_title: 'Depth Only',
                  units: 'meters',
                  payload_prefix: 'depth',
                  min_val: -50,
                  max_val: -2,
                  default_min_val: -30,
                  default_max_val: -5
                }
              ]
            }
          ]
        })
        .expect(200);

      // Verify removals
      const region2 = await prisma.region.findUnique({
        where: { name: 'region2' }
      });
      expect(region2).toBeNull();

      const slopeCriteria = await prisma.criteria.findUnique({
        where: { name: 'slope' }
      });
      expect(slopeCriteria).toBeNull();

      // Verify remaining data
      const region1 = await prisma.region.findUnique({
        where: { name: 'region1' }
      });
      expect(region1).toBeTruthy();
    });

    it('should handle empty specification (remove all)', async () => {
      // Create initial data
      await authRequest(app, 'admin')
        .post('/api/admin/data-specification')
        .send({
          regions: [
            {
              name: 'test_region',
              display_name: 'Test Region',
              criteria: [
                {
                  name: 'depth',
                  display_title: 'Depth',
                  units: 'meters',
                  payload_prefix: 'depth',
                  min_val: -50,
                  max_val: -2,
                  default_min_val: -30,
                  default_max_val: -5
                }
              ]
            }
          ]
        })
        .expect(200);

      // Clear all data
      const res = await authRequest(app, 'admin')
        .post('/api/admin/data-specification')
        .send({ regions: [] })
        .expect(200);

      expect(res.body.updated.criteria_count).toBe(0);
      expect(res.body.updated.regions_count).toBe(0);
      expect(res.body.updated.regional_criteria_count).toBe(0);

      // Verify database is empty
      const regionCount = await prisma.region.count();
      const criteriaCount = await prisma.criteria.count();
      const regionalCriteriaCount = await prisma.regionalCriteria.count();

      expect(regionCount).toBe(0);
      expect(criteriaCount).toBe(0);
      expect(regionalCriteriaCount).toBe(0);
    });

    it('should return 401 for non-admin users', async () => {
      await authRequest(app, 'user1')
        .post('/api/admin/data-specification')
        .send({ regions: [] })
        .expect(401);
    });
  });

  describe('GET /api/admin/criteria/:region/ranges', () => {
    beforeEach(async () => {
      // Setup test data
      await authRequest(app, 'admin')
        .post('/api/admin/data-specification')
        .send({
          regions: [
            {
              name: 'test_region',
              display_name: 'Test Region',
              criteria: [
                {
                  name: 'depth',
                  display_title: 'Depth Range',
                  display_subtitle: 'Water depth constraints',
                  units: 'meters',
                  min_tooltip: 'Minimum depth',
                  max_tooltip: 'Maximum depth',
                  payload_prefix: 'depth',
                  min_val: -50,
                  max_val: -2,
                  default_min_val: -30,
                  default_max_val: -5
                },
                {
                  name: 'slope',
                  display_title: 'Slope Range',
                  units: 'degrees',
                  payload_prefix: 'slope',
                  min_val: 0,
                  max_val: 45,
                  default_min_val: 5,
                  default_max_val: 30
                }
              ]
            }
          ]
        })
        .expect(200);
    });

    it('should return criteria ranges for a region', async () => {
      const res = await authRequest(app, 'user1')
        .get('/api/admin/criteria/test_region/ranges')
        .expect(200);

      expect(res.body).toHaveProperty('depth');
      expect(res.body).toHaveProperty('slope');

      const depthCriteria = res.body.depth;
      expect(depthCriteria.id).toBe('depth');
      expect(depthCriteria.min_val).toBe(-50);
      expect(depthCriteria.max_val).toBe(-2);
      expect(depthCriteria.display_title).toBe('Depth Range');
      expect(depthCriteria.display_subtitle).toBe('Water depth constraints');
      expect(depthCriteria.units).toBe('meters');
      expect(depthCriteria.default_min_val).toBe(-30);
      expect(depthCriteria.default_max_val).toBe(-5);
      expect(depthCriteria.payload_property_prefix).toBe('depth');
    });

    it('should reflect updated criteria ranges', async () => {
      // Update the data
      await authRequest(app, 'admin')
        .post('/api/admin/data-specification')
        .send({
          regions: [
            {
              name: 'test_region',
              display_name: 'Test Region',
              criteria: [
                {
                  name: 'depth',
                  display_title: 'Updated Depth Range',
                  units: 'meters',
                  payload_prefix: 'depth',
                  min_val: -100,
                  max_val: -1,
                  default_min_val: -50,
                  default_max_val: -3
                }
              ]
            }
          ]
        })
        .expect(200);

      const res = await authRequest(app, 'user1')
        .get('/api/admin/criteria/test_region/ranges')
        .expect(200);

      expect(res.body.depth.min_val).toBe(-100);
      expect(res.body.depth.max_val).toBe(-1);
      expect(res.body.depth.display_title).toBe('Updated Depth Range');
      expect(res.body.depth.default_min_val).toBe(-50);
      expect(res.body.depth.default_max_val).toBe(-3);

      // Slope should be removed
      expect(res.body.slope).toBeUndefined();
    });

    it('should return 404 for non-existent region', async () => {
      await authRequest(app, 'user1')
        .get('/api/admin/criteria/nonexistent_region/ranges')
        .expect(404);
    });
  });
});
