'use client';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@app/components/ui/tabs';
import { formatAddress, stack } from '@app/lib/sdk/stack/client';
import { client } from '@app/lib/sdk/thirdweb/client';
import { CREATIVE_ADDRESS } from '@app/lib/utils/context';
import Unlock from '@app/lib/utils/Unlock.json';
import { NextPage } from 'next';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getContract, prepareContractCall } from 'thirdweb';
import { base } from 'thirdweb/chains';
import { getNFT, getOwnedTokenIds } from 'thirdweb/extensions/erc721';
import {
  TransactionButton,
  useActiveAccount,
  useReadContract,
} from 'thirdweb/react';
import { Account } from 'thirdweb/wallets';
import LazyMintedAsset from '../lazy-minted/LazyMinted';
import ListUploadedAssets from '../list-uploaded-assets/ListUploadedAssets';
import CreateMetoken from '../MeToken/createMetoken';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../ui/card';
import MemberCard from './MemberCard';

const ProfilePage: NextPage = () => {
  const { user } = useParams();
  const [transferAddress, setTransferAddress] = useState('');
  const [lendingAddress, setLendingAddress] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [ownedIds, setOwnedIds] = useState<bigint[]>([]);
  const activeAccount = useActiveAccount();
  const [memberData, setMemberData] = useState<any>(null);
  const [nftData, setNftData] = useState<any>(null);
  const [balance, setBalance] = useState<string>('');
  const [points, setPoints] = useState<number>(0);

  const unlockAbi = Unlock.abi as any;

  /*******  CONTRACT READING ********/
  const unlockContract = getContract({
    client: client,
    chain: base,
    address: '0xf7c4cd399395d80f9d61fde833849106775269c6',
    abi: unlockAbi,
  });

  const { data: result, isLoading } = useReadContract({
    contract: unlockContract,
    method: 'getHasValidKey',
    params: [activeAccount?.address],
  });

  // Separate effect for fetching points
  useEffect(() => {
    const fetchPoints = async () => {
      if (activeAccount?.address) {
        try {
          const formattedAddress = formatAddress(activeAccount);
          const userPoints = await stack.getPoints(formattedAddress);
          setBalance(userPoints.toString());
        } catch (error) {
          console.error('Error fetching points:', error);
          setBalance('0');
        }
      }
    };

    fetchPoints();
  }, [activeAccount]);

  useEffect(() => {
    const fetchData = async () => {
      if (activeAccount) {
        try {
          // Fetch owned token IDs
          const ownedTokenIds = await getOwnedTokenIds({
            contract: unlockContract,
            owner: activeAccount.address,
          });
          setOwnedIds(ownedTokenIds);

          // Fetch NFT metadata if there are owned tokens
          if (ownedTokenIds.length > 0) {
            const metadata = await getNFT({
              contract: unlockContract,
              tokenId: ownedTokenIds[0],
            });
            setNftData(metadata);
          }

          setMemberData(activeAccount);
          setBalance('0');
        } catch (error) {
          console.error('Error fetching NFT data:', error);
        }
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount]);

  useEffect(() => {
    const fetchNFTData = async () => {
      try {
        const metadata = await getNFT({
          contract: unlockContract,
          tokenId: ownedIds[0],
        });

        setNftData(metadata);
      } catch (err) {
        toast.error('NFT Data Error', {
          description:
            err instanceof Error ? err.message : 'Failed to fetch NFT data',
          duration: 3000,
        });
      }
    };

    if (ownedIds.length > 0) {
      fetchNFTData();
    }
  }, [unlockContract, ownedIds]);

  useEffect(() => {
    if (activeAccount) {
      setMemberData(activeAccount);
      setBalance('0');
    }
  }, [activeAccount]);

  return (
    <div className="container mx-auto my-5 px-4">
      <Tabs defaultValue="Membership" className="mx-auto w-full max-w-3xl">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger id="members" value="Membership">
            Membership
          </TabsTrigger>
          <TabsTrigger id="metoken" value="MeToken">
            MeToken
          </TabsTrigger>
          <TabsTrigger id="uploads" value="Uploads">
            Uploads
          </TabsTrigger>
          <TabsTrigger id="minted" value="Minted">
            Minted
          </TabsTrigger>
          <TabsTrigger id="revenue" value="Revenue">
            Revenue
          </TabsTrigger>
        </TabsList>
        <TabsContent value="Membership">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Membership</CardTitle>
              <CardDescription>
                Make actions on your membership here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="space-y-1">
                <MemberCard
                  member={memberData}
                  nft={nftData}
                  balance={balance}
                  points={points}
                />
              </div>
            </CardContent>
            <CardFooter className="space-x-2">
              <TransactionButton
                transaction={() =>
                  prepareContractCall({
                    contract: unlockContract,
                    method: 'renewMembershipFor',
                    params: [ownedIds, CREATIVE_ADDRESS],
                  })
                }
                onClick={() => toast.success('Successful Membership Renewal!')}
                onError={(error: Error) =>
                  toast.error('Error Renewing Membership.')
                }
              >
                Renew
              </TransactionButton>
              <TransactionButton
                transaction={() =>
                  prepareContractCall({
                    contract: unlockContract,
                    method: 'cancelAndRefund',
                    params: [ownedIds],
                  })
                }
                onClick={() =>
                  toast.success('Cancelled Membership Successfully!')
                }
                onError={(error: Error) =>
                  toast.error('Error Cancelling Your Membership.')
                }
              >
                Cancel
              </TransactionButton>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="Uploads">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Upload</CardTitle>
              <CardDescription>Pick a video to be uploaded.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="space-y-1">
                <Link href={`/profile/${activeAccount?.address}/upload`}>
                  Go to upload
                </Link>
              </div>
            </CardContent>
            <CardFooter className="space-x-2"></CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="Minted">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Lazy minted nfts</CardTitle>
              <CardDescription>
                Here is the list of your lazy minted nfts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {activeAccount && (
                <LazyMintedAsset activeAccount={activeAccount as Account} />
              )}
            </CardContent>
            <CardFooter className="space-x-2"></CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="MeToken">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Create A MeToken</CardTitle>
              <CardDescription>
                Generate your own creator token here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CreateMetoken />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="Uploads">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Upload History</CardTitle>
              <CardDescription>Uploaded videos will show here.</CardDescription>
            </CardHeader>
            <CardContent>
              {/* <AssetDetails /> */}
              <ListUploadedAssets activeAccount={activeAccount as Account} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="Revenue">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Revenue</CardTitle>
              <CardDescription>Your revenue will show here.</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Coming Soon</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProfilePage;
