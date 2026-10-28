import 'server-only';
import { createBff } from '../../../server/bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handle = createBff();

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
export const OPTIONS = handle;
export const HEAD = handle;
