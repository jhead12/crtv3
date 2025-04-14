import { NextRequest, NextResponse } from 'next/server';
import { verifySignature } from 'thirdweb/auth';
import { thirdwebAuth } from '@app/lib/sdk/thirdweb/auth';
import { cookies } from 'next/headers';
import { getAddress } from 'viem';
import { db } from '@app/lib/sdk/orbisDB/client';
import { OrbisKeyDidAuth } from '@useorbis/db-sdk/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { payload, signature } = body;

    console.log('Login attempt:', {
      payloadType: typeof payload,
      payloadKeys: Object.keys(payload),
      signatureType: typeof signature,
    });

    // Verify the signature
    const isValid = await verifySignature({
      message: JSON.stringify(payload),
      signature,
      address: payload.address,
    });

    console.log('Signature verification:', {
      isValid,
      address: payload.address,
      messageType: typeof JSON.stringify(payload),
    });

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Normalize addresses for comparison
    const signerAddress = getAddress(payload.address);
    console.log('Normalized signer address:', signerAddress);

    // Connect to Orbis using KeyDidAuth
    try {
      console.log('Connecting to Orbis...');
      const seed = await OrbisKeyDidAuth.generateSeed();
      console.log('Seed generated:', !!seed);

      const auth = await OrbisKeyDidAuth.fromSeed(seed);
      console.log('Auth created:', !!auth);

      const orbisResult = await db.connectUser({ auth });
      console.log('Orbis connection result:', {
        success: !!orbisResult,
        resultType: typeof orbisResult,
      });

      if (!orbisResult) {
        console.error('Failed to connect to Orbis');
        return NextResponse.json(
          { error: 'Failed to connect to Orbis' },
          { status: 401 },
        );
      }

      console.log('Successfully connected to Orbis');
    } catch (orbisError) {
      console.error('Orbis connection error:', {
        error: orbisError,
        message:
          orbisError instanceof Error ? orbisError.message : String(orbisError),
        stack: orbisError instanceof Error ? orbisError.stack : undefined,
      });
      return NextResponse.json(
        { error: 'Failed to connect to Orbis' },
        { status: 401 },
      );
    }

    // Generate JWT
    // const jwt = await thirdwebAuth.generateJWT({
    //   payload: {
    //     address: signerAddress,
    //     ...payload,
    //   },
    // });

  

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 },
    );
  }
}
