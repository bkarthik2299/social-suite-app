import re

with open(r'd:\BK\SS App\social-suite\src\pages\CampaignDashboard.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
content = content.replace(
    "import { useApp } from '@/context/AppContext';",
    "import { useContentItems, useCampaigns } from '@/hooks/useDatabase';"
)

# 2. SocialPostsTab
content = re.sub(
    r'const \{ socialPosts, addSocialPost, updateSocialPost, deleteSocialPost \} = useApp\(\);',
    r'''const { data: dbItems = [], addContentItem, updateContentItem, deleteContentItem } = useContentItems(campaignId);
    const socialPosts = (dbItems || []).filter(i => i.type === 'post' || i.type === 'socials').map(i => ({ id: i.id, campaignId: i.campaign_id, name: i.name, status: i.status, ...(i.payload as any) }));''',
    content
)
content = re.sub(
    r'updateSocialPost\((.*?), postData\);',
    r'updateContentItem.mutate({ id: \1, updates: { name, payload: postData } });',
    content
)
content = re.sub(
    r'addSocialPost\((.*?)\);',
    r"addContentItem.mutate({ type: 'post', name, payload: \1 });",
    content
)
content = re.sub(
    r'deleteSocialPost\((.*?)\)',
    r'deleteContentItem.mutate(\1)',
    content
)

# 3. GoogleAdsTab
content = re.sub(
    r'const \{ googleAds, addGoogleAd, updateGoogleAd, deleteGoogleAd \} = useApp\(\);',
    r'''const { data: dbItems = [], addContentItem, updateContentItem, deleteContentItem } = useContentItems(campaignId);
    const googleAds = (dbItems || []).filter(i => i.type === 'google-ad').map(i => ({ id: i.id, campaignId: i.campaign_id, name: i.name, status: i.status, ...(i.payload as any) }));''',
    content
)
content = re.sub(
    r'updateGoogleAd\((.*?), adData\);',
    r'updateContentItem.mutate({ id: \1, updates: { name, payload: adData } });',
    content
)
content = re.sub(
    r'addGoogleAd\((.*?)\);',
    r"addContentItem.mutate({ type: 'google-ad', name, payload: \1 });",
    content
)
content = re.sub(
    r'deleteGoogleAd\((.*?)\)',
    r'deleteContentItem.mutate(\1)',
    content
)

# 4. SocialAdsTab
content = re.sub(
    r'const \{ socialAds, addSocialAd, updateSocialAd, deleteSocialAd \} = useApp\(\);',
    r'''const { data: dbItems = [], addContentItem, updateContentItem, deleteContentItem } = useContentItems(campaignId);
    const socialAds = (dbItems || []).filter(i => i.type === 'social-ad' || i.type === 'ad' || i.type === 'meta-ad').map(i => ({ id: i.id, campaignId: i.campaign_id, name: i.name, status: i.status, ...(i.payload as any) }));''',
    content
)
content = re.sub(
    r'updateSocialAd\((.*?), adData\);',
    r'updateContentItem.mutate({ id: \1, updates: { name, payload: adData } });',
    content
)
content = re.sub(
    r'addSocialAd\((.*?)\);',
    r"addContentItem.mutate({ type: 'meta-ad', name, payload: \1 });",
    content
)
content = re.sub(
    r'deleteSocialAd\((.*?)\)',
    r'deleteContentItem.mutate(\1)',
    content
)

# 5. BlogsTab
content = re.sub(
    r'const \{ blogs, addBlog, updateBlog, deleteBlog \} = useApp\(\);',
    r'''const { data: dbItems = [], addContentItem, updateContentItem, deleteContentItem } = useContentItems(campaignId);
    const blogs = (dbItems || []).filter(i => i.type === 'blog' || i.type === 'blogs').map(i => ({ id: i.id, campaignId: i.campaign_id, name: i.name, status: i.status, ...(i.payload as any) }));''',
    content
)
content = re.sub(
    r'updateBlog\((.*?), blogData\);',
    r'updateContentItem.mutate({ id: \1, updates: { name, payload: blogData } });',
    content
)
content = re.sub(
    r'addBlog\((.*?)\);',
    r"addContentItem.mutate({ type: 'blogs', name, payload: \1 });",
    content
)
content = re.sub(
    r'deleteBlog\((.*?)\)',
    r'deleteContentItem.mutate(\1)',
    content
)

# 6. CampaignDashboard main component
content = re.sub(
    r'const \{ campaigns, updateCampaign \} = useApp\(\);',
    r'''const { data: campaigns = [], updateCampaign } = useCampaigns(folderId || '');''',
    content
)
content = re.sub(
    r'updateCampaign\(campaignId, \{ name: newName \}\)',
    r'updateCampaign.mutate({ id: campaignId, updates: { name: newName } })',
    content
)

with open(r'd:\BK\SS App\social-suite\src\pages\CampaignDashboard.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
