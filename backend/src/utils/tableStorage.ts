import { TableClient, TableServiceClient } from '@azure/data-tables';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING!;

export function getTableClient(tableName: string): TableClient {
  return TableClient.fromConnectionString(connectionString, tableName);
}

export async function ensureTable(tableName: string): Promise<void> {
  const service = TableServiceClient.fromConnectionString(connectionString);
  try {
    await service.createTable(tableName);
  } catch (e: any) {
    if (e.statusCode !== 409) throw e; // 409 = already exists, that's fine
  }
}

export async function upsertEntity<T extends { partitionKey: string; rowKey: string }>(
  tableName: string,
  entity: T
): Promise<void> {
  const client = getTableClient(tableName);
  await client.upsertEntity(entity, 'Replace');
}

export async function getEntity<T>(
  tableName: string,
  partitionKey: string,
  rowKey: string
): Promise<T | null> {
  try {
    const client = getTableClient(tableName);
    return (await client.getEntity<T>(partitionKey, rowKey)) as T;
  } catch (e: any) {
    if (e.statusCode === 404) return null;
    throw e;
  }
}

export async function queryEntities<T>(tableName: string, filter: string): Promise<T[]> {
  const client = getTableClient(tableName);
  const results: T[] = [];
  const iter = client.listEntities<T>({ queryOptions: { filter } });
  for await (const entity of iter) {
    results.push(entity);
  }
  return results;
}

export async function deleteEntity(
  tableName: string,
  partitionKey: string,
  rowKey: string
): Promise<void> {
  const client = getTableClient(tableName);
  await client.deleteEntity(partitionKey, rowKey);
}

export async function queryEntitiesAll<T>(tableName: string): Promise<T[]> {
  const client = getTableClient(tableName);
  const results: T[] = [];
  const iter = client.listEntities<T>();
  for await (const entity of iter) {
    results.push(entity);
  }
  return results;
}
