// api/auth/login.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { thirdwebAuth } from "@app/lib/sdk/thirdweb/auth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
    if (req.method === 'POST') {
        const payload = req.body;
        
        try {
            const verifiedPayload = await thirdwebAuth.verifyPayload(payload);
            
            if (verifiedPayload.valid) {
                const jwt = await thirdwebAuth.generateJWT({
                    payload: verifiedPayload.payload,
                    context: {
                        address: verifiedPayload.payload.address
                    }
                });
                
                res.status(200).json({ jwt });
            } else {
                res.status(401).json({ message: 'Invalid login payload' });
            }
        } catch (error) {
            console.error('Error verifying or generating JWT:', error);
            res.status(500).json({ message: 'Internal Server Error' });
        }
    } else {
        res.status(405).end(); // Method Not Allowed
    }
}