import re

with open(r'd:\BK\SS App\social-suite\src\pages\tools\ClientPortal.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Imports
content = content.replace(
    "import { useApp } from '@/context/AppContext';",
    "import { useProjects, useAllFolders, useAllCampaigns, useAllContentItems, usePortalClients, usePortalFeeds, usePortalReviewPosts } from '@/hooks/useDatabase';"
)

# ClientPortal main
content = re.sub(
    r'const \{ projects, folders, campaigns, socialPosts, googleAds, socialAds, blogs \} = useApp\(\);[\s\S]*?const \[posts, setPosts\] = useState<ReviewPost\[\]>\(initialPosts\);',
    r'''const { data: projects = [] } = useProjects();
    const { data: folders = [] } = useAllFolders();
    const { data: campaigns = [] } = useAllCampaigns();
    const { data: contentItems = [] } = useAllContentItems();
    const { data: dbClients = [], addClient, updateClient, deleteClient } = usePortalClients();
    
    const [view, setView] = useState<'grid' | 'workspace'>('grid');
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

    const clients = dbClients.map(c => ({
        id: c.id,
        name: c.name,
        company: c.company || c.name,
        logo: c.logo || c.name.charAt(0).toUpperCase(),
        pendingCount: 0
    }));''',
    content
)

content = re.sub(
    r'const handleRenameClient = \(id: string, newName: string\) => \{[\s\S]*?\};',
    r'''const handleRenameClient = (id: string, newName: string) => {
        updateClient.mutate({ id, name: newName });
    };''',
    content
)

content = re.sub(
    r'const handleDeleteClient = \(id: string\) => \{[\s\S]*?\};',
    r'''const handleDeleteClient = (id: string) => {
        deleteClient.mutate(id);
        if (selectedClientId === id) {
            handleBackToGrid();
        }
    };''',
    content
)

content = re.sub(
    r'const handleAddClient = \(name: string, company: string\) => \{[\s\S]*?\n\s*\};',
    r'''const handleAddClient = (name: string, company: string) => {
        addClient.mutate({ name, company });
    };''',
    content
)

# Tree builder modification
content = re.sub(
    r'const folderCampaigns = campaigns\.filter\(c => c\.folderId === folder\.id\);',
    r'''const folderCampaigns = campaigns.filter(c => c.folder_id === folder.id);''',
    content
)

content = re.sub(
    r'// Get posts based on campaign type[\s\S]*?return \{',
    r'''// Get posts
                    const campaignPosts = contentItems.filter(p => p.campaign_id === campaign.id);
                    let postNodes: TreeItem[] = campaignPosts.map(post => {
                        let name = post.name || 'Untitled';
                        if (post.type === 'post' || post.type === 'socials') name = (post.payload as any)?.caption?.slice(0,40) || name;
                        else if (post.type === 'google-ad') name = (post.payload as any)?.headlines?.[0] || name;
                        else if (post.type === 'meta-ad' || post.type === 'social-ad') name = (post.payload as any)?.primaryText || name;
                        else if (post.type === 'blog' || post.type === 'blogs') name = (post.payload as any)?.title || name;

                        return {
                            id: post.id,
                            type: 'post' as const,
                            name: name,
                            originalPost: post as any
                        };
                    });

                    return {''',
    content
)

# ClientWorkspace props and logic
content = re.sub(
    r'feeds=\{feeds\}\s*\n\s*setFeeds=\{setFeeds\}\s*\n\s*posts=\{posts\}\s*\n\s*setPosts=\{setPosts\}\s*\n\s*',
    r'',
    content
)

content = re.sub(
    r'interface ClientWorkspaceProps \{[\s\S]*?\}',
    r'''interface ClientWorkspaceProps {
    clientId: string;
    client: Client;
    onBack: () => void;
    treeData: TreeItem[];
}''',
    content
)

content = re.sub(
    r'function ClientWorkspace\(\{ clientId, client, feeds, setFeeds, posts, setPosts, onBack, treeData \}: ClientWorkspaceProps\) \{[\s\S]*?const feedPosts = selectedFeedId \? posts\.filter\(p => p\.feedId === selectedFeedId\) : \[\];',
    r'''function ClientWorkspace({ clientId, client, onBack, treeData }: ClientWorkspaceProps) {
    const { data: dbFeeds = [], addFeed } = usePortalFeeds(clientId);
    const clientFeeds = dbFeeds.map(f => ({ id: f.id, clientId: f.client_id, name: f.name, postCount: 0 }));
    
    const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
    useEffect(() => {
        if (!selectedFeedId && clientFeeds.length > 0) {
            setSelectedFeedId(clientFeeds[0].id);
        }
    }, [clientFeeds, selectedFeedId]);
    
    const [isCreateFeedOpen, setIsCreateFeedOpen] = useState(false);
    const [newFeedName, setNewFeedName] = useState('');

    const { data: dbPosts = [], addReviewPost, updateReviewStatus } = usePortalReviewPosts(selectedFeedId || '');
    const feedPosts = dbPosts.map(p => ({
        id: p.id,
        platform: p.platform as any,
        content: p.content,
        image: p.image_url,
        status: p.status as any,
        date: p.created_at,
        feedId: p.feed_id,
        comments: [], // Comments use separate query or mapping if needed
        contentType: p.content_type,
        ...p.snapshot as any
    }));''',
    content
)

content = re.sub(
    r'const handleCreateFeedSubmit = \(\) => \{[\s\S]*?\n\s*\};',
    r'''const handleCreateFeedSubmit = () => {
        if (!newFeedName.trim()) return;
        addFeed.mutate(newFeedName);
        setIsCreateFeedOpen(false);
    };''',
    content
)

content = re.sub(
    r'const handleImportPosts = \(newPosts: ReviewPost\[\]\) => \{[\s\S]*?\n\s*\};',
    r'''const handleImportPosts = (newPosts: ReviewPost[]) => {
        newPosts.forEach(post => {
            addReviewPost.mutate({
                content_item_id: (post as any)._contentItemId,
                content_type: post.contentType,
                snapshot: {
                    platform: post.platform,
                    content: post.content,
                    image_url: post.image,
                    ...post
                }
            });
        });
    };''',
    content
)

# Post updating inside map
content = re.sub(
    r'onUpdate=\{\(updatedPost\) => \{\n\s*setPosts\(posts\.map\(p => p\.id === updatedPost\.id \? updatedPost : p\)\);\n\s*\}\}',
    r'''onUpdate={(updatedPost) => {
                                                updateReviewStatus.mutate({ id: updatedPost.id, status: updatedPost.status });
                                            }}''',
    content
)

# PostPicker mapping adjustments
content = re.sub(
    r'if \(item\.originalPost\) \{[\s\S]*?return null;\n\s*\}\)\.filter\(Boolean\) as ReviewPost\[\];',
    r'''
            const dbPost = item.originalPost as any;
            if (dbPost) {
                const payload = dbPost.payload || {};
                return {
                    ...basePost,
                    _contentItemId: dbPost.id,
                    platform: payload.platform || 'instagram',
                    content: payload.caption || payload.primaryText || payload.headlines?.[0] || dbPost.name,
                    image: payload.image || payload.image_url,
                    contentType: dbPost.type,
                    ...payload
                };
            } else if (item.type === 'campaign') {
                return {
                    ...basePost,
                    platform: 'instagram',
                    content: item.name,
                    contentType: 'campaign',
                    campaignName: item.name,
                    campaignType: item.campaignType,
                };
            }
            return null;
        }).filter(Boolean) as ReviewPost[];''',
    content
)


with open(r'd:\BK\SS App\social-suite\src\pages\tools\ClientPortal.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
