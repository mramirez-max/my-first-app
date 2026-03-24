import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'

export async function POST(request: Request): Promise<NextResponse> {
  console.log('[upload] POST called')

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('[upload] BLOB_READ_WRITE_TOKEN is not set')
    return NextResponse.json({ error: 'Blob storage not configured (missing BLOB_READ_WRITE_TOKEN)' }, { status: 500 })
  }

  let body: HandleUploadBody
  try {
    body = (await request.json()) as HandleUploadBody
    console.log('[upload] request type:', (body as { type?: string }).type)
  } catch (err) {
    console.error('[upload] failed to parse request body:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        console.log('[upload] generating client token (15 MB limit, PDF only)')
        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes: 15 * 1024 * 1024,
        }
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('[upload] ✅ upload completed, blob URL:', blob.url)
      },
    })
    console.log('[upload] handleUpload response ok')
    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error('[upload] handleUpload error:', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
