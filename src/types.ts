export interface DnsRecord {
  type: string;
  name: string;
  ttl?: number;
  address?: string;
  value?: string;
  priority?: number;
  weight?: number;
  port?: number;
  target?: string;
  group?: { type: string };
}

export interface DnsRecordList {
  items: DnsRecord[];
  total: number;
}
