/** A DNS record as returned by the API; type-specific fields vary (see records.ts). */
export interface DnsRecord {
  type: string;
  name: string;
  ttl?: number;
  group?: { type: string };
  [field: string]: unknown;
}

export interface DnsRecordList {
  items: DnsRecord[];
  total: number;
}
