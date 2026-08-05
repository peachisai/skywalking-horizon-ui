import type {
  EvaluationRecordFacetsResponse,
  EvaluationRecordQueryRequest,
  EvaluationRecordsResponse,
} from '@skywalking-horizon-ui/api-client';
import type { BffClient } from '../client';

export class EvaluationRecordApi {
  constructor(private readonly bff: BffClient) {}

  list(layerKey: string, body: EvaluationRecordQueryRequest = {}): Promise<EvaluationRecordsResponse> {
    return this.bff.request<EvaluationRecordsResponse>(
      'POST',
      `/api/layer/${encodeURIComponent(layerKey)}/evaluation-records`,
      body,
    );
  }

  facets(
    layerKey: string,
    body: EvaluationRecordQueryRequest & { sampleSize?: number } = {},
  ): Promise<EvaluationRecordFacetsResponse> {
    return this.bff.request<EvaluationRecordFacetsResponse>(
      'POST',
      `/api/layer/${encodeURIComponent(layerKey)}/evaluation-records/facets`,
      body,
    );
  }
}
