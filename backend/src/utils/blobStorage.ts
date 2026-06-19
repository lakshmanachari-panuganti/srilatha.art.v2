import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING ?? '';

let cachedService: BlobServiceClient | null = null;
function getBlobService(): BlobServiceClient {
  if (!cachedService) {
    if (!connectionString) {
      throw new Error('AZURE_STORAGE_CONNECTION_STRING is not configured');
    }
    cachedService = BlobServiceClient.fromConnectionString(connectionString);
  }
  return cachedService;
}

export function getContainer(name: string): ContainerClient {
  return getBlobService().getContainerClient(name);
}

/**
 * Upload a buffer to a blob container, returning the public URL.
 * The caller is responsible for picking a globally-unique blob name.
 *
 * The container must already exist and have anonymous Blob-level read
 * access if the URL is to be served directly to browsers.
 */
export async function uploadBlob(
  container: string,
  blobName: string,
  body: Buffer,
  contentType: string,
): Promise<{ url: string; blobName: string }> {
  const containerClient = getContainer(container);
  const blob = containerClient.getBlockBlobClient(blobName);
  await blob.uploadData(body, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
  return { url: blob.url, blobName };
}
