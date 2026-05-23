import re

with open(r'd:\BK\SS App\social-suite\src\components\shared\GlobalCommand.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("import { useApp } from \"@/context/AppContext\";", "import { useProjects, useAllFolders, useAllCampaigns, useAllContentItems } from '@/hooks/useDatabase';")

# Replace hook usage
content = re.sub(
    r'const \{ projects, folders, campaigns, blogs, socialPosts, socialAds, googleAds \} = useApp\(\);',
    r'''const { data: projects = [] } = useProjects();
    const { data: folders = [] } = useAllFolders();
    const { data: campaigns = [] } = useAllCampaigns();
    const { data: contentItems = [] } = useAllContentItems();
    
    // Map existing groups using contentItems
    const blogs = contentItems.filter(i => i.type === 'blog' || i.type === 'blogs');
    const socialPosts = contentItems.filter(i => i.type === 'post' || i.type === 'socials');
    const googleAds = contentItems.filter(i => i.type === 'google-ad');
    const socialAds = contentItems.filter(i => i.type === 'social-ad' || i.type === 'meta-ad');
    ''',
    content
)

# Search items mapping mapping name resolution
content = re.sub(
    r'\{socialPosts\.map\(\(post\) => \(\n\s*<Command\.Item\n\s*key=\{post\.id\}',
    r'''{socialPosts.map((post) => (
                                        <Command.Item
                                            key={post.id}''',
    content
)

# Replace name rendering for blogs
content = re.sub(
    r'<span>\{blog\.title\}</span>',
    r'<span>{(blog.payload as any)?.title || blog.name || "Untitled Blog"}</span>',
    content
)

# Replace name rendering for socialPosts
content = re.sub(
    r'<span>\{post\.caption\?\.slice\(0, 40\)\}\.\.\.</span>',
    r'<span>{(post.payload as any)?.caption?.slice(0, 40) || post.name || "Untitled Post"}...</span>',
    content
)

# Replace name rendering for social ads
content = re.sub(
    r'<span>\{ad\.primaryText\?\.slice\(0, 40\)\}\.\.\.</span>',
    r'<span>{(ad.payload as any)?.primaryText?.slice(0, 40) || ad.name || "Untitled Ad"}...</span>',
    content
)

# Replace name rendering for google ads
content = re.sub(
    r'<span>\{ad\.headlines\?\.\[0\] || \'Untitled Google Ad\'\}</span>',
    r'<span>{(ad.payload as any)?.headlines?.[0] || ad.name || "Untitled Google Ad"}</span>',
    content
)

with open(r'd:\BK\SS App\social-suite\src\components\shared\GlobalCommand.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
