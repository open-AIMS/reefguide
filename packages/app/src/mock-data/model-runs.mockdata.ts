import { ResultSetInfo } from '../types/api.type';

export const MODEL_RUNS: Array<ResultSetInfo> = [
  {
    id: 'MOCK-1',
    title: 'Alternative Coral Class Study 2022',
    desc: 'Mock: Hello description....',
    invoke_time: new Date(2024, 7, 1, 11).toDateString(),
    runtime: '22m 15s',
    publish_date: new Date(2024, 7, 3),
    creator: 'Takuya',
    model_name: 'CoralBlox',
    model_version: 'v1.1',
    datapkg_name: 'Moore',
    n_scenarios: 100,
    n_locations: 256,
    n_timesteps: 50,
    start_year: 2020,
    end_year: 2100,
    handle_id: 'foo'
  },
  {
    id: 'MOCK-2',
    title: 'EcoBlox Default Run',
    desc: 'Mock: Default run for EcoBlox release.',
    invoke_time: new Date(2024, 7, 10, 11).toDateString(),
    runtime: '15m 33s',
    publish_date: new Date(2024, 7, 11),
    creator: 'Takuya',
    model_name: 'CoralBlox',
    model_version: 'v1.2',
    datapkg_name: 'Moore',
    n_scenarios: 100,
    n_locations: 256,
    n_timesteps: 50,
    start_year: 2020,
    end_year: 2100,
    handle_id: 'bar'
  }
];
