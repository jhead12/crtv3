// server.js

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  // Handle GET requests
  const jwt = cookies().get('jwt');

  if (jwt?.value) {
    return NextResponse.json({ allowed: true });
  }

  return NextResponse.json({ allowed: false }, { status: 401 });
}

export async function POST(request: NextRequest) {
  // Handle POST requests
  const payload = await request.json();

  // Validate and process the payload here

  return NextResponse.json({ allowed: true });
}