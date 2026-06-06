import {
    LayoutGrid,
    Lock,
    Globe,
    Newspaper,
    ScanEye,
    Notebook,
    Palette
} from 'lucide-react';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const tools = [
    {
        name: "Password Vault",
        icon: Lock,
        color: "text-amber-500",
        bg: "bg-amber-50"
    },
    {
        name: "SM Preview",
        icon: ScanEye,
        color: "text-rose-500",
        bg: "bg-rose-50"
    },
    {
        name: "Client Portal",
        icon: Globe,
        color: "text-blue-500",
        bg: "bg-blue-50"
    },
    {
        name: "Reference Feed",
        icon: Newspaper,
        color: "text-pink-500",
        bg: "bg-pink-50"
    },
    {
        name: "Notes",
        icon: Notebook,
        color: "text-violet-500",
        bg: "bg-violet-50"
    },
    {
        name: "Brand Guide",
        icon: Palette,
        color: "text-emerald-500",
        bg: "bg-emerald-50"
    }
];

export function MicroToolsMenu() {
    const navigate = useNavigate();

    const handleToolClick = (toolName: string) => {
        if (toolName === "Password Vault") {
            navigate("/tools/vault");
        } else if (toolName === "Reference Feed") {
            navigate("/tools/feed");
        } else if (toolName === "Client Portal") {
            navigate("/tools/client-portal");
        } else if (toolName === "SM Preview") {
            navigate("/tools/sm-preview");
        } else if (toolName === "Notes") {
            navigate("/tools/notes");
        } else if (toolName === "Brand Guide") {
            navigate("/tools/brand-guide");
        }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="soft-card h-9 w-9 rounded-full text-primary transition-colors hover:bg-white hover:text-primary"
                >
                    <LayoutGrid className="h-5 w-5" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="soft-card w-80 rounded-2xl border-0 p-4 !shadow-[0_8px_24px_-20px_rgb(37_99_235_/_0.35),0_1px_3px_0_rgb(15_23_42_/_0.05)]"
                align="end"
                sideOffset={8}
            >
                <div className="grid grid-cols-3 gap-2">
                    {tools.map((tool) => (
                        <Button
                            key={tool.name}
                            variant="ghost"
                            className="flex h-24 flex-col items-center justify-center gap-2 rounded-xl px-2 text-center whitespace-normal shadow-none hover:bg-blue-50/60 focus-visible:ring-0 focus-visible:ring-offset-0 group"
                            onClick={() => handleToolClick(tool.name)}
                        >
                            <div className={cn("p-2.5 rounded-xl", tool.bg)}>
                                <tool.icon className={cn("h-6 w-6", tool.color)} />
                            </div>
                            <span className="text-xs font-medium text-center leading-tight text-muted-foreground group-hover:text-foreground">
                                {tool.name}
                            </span>
                        </Button>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}
