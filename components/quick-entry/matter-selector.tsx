"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { ChevronsUpDown, Check, FolderOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Matter } from "@/lib/types"
import { BILLING_TYPE_SHORT } from "@/lib/types"
import type { BillingType } from "@/lib/types"

interface MatterSelectorProps {
  matters: Matter[]
  value: string | null
  onChange: (matterId: string) => void
}

export function MatterSelector({ matters, value, onChange }: MatterSelectorProps) {
  const [open, setOpen] = useState(false)
  const selected = matters.find((m) => m.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-9 font-normal cursor-pointer"
          />
        }
      >
        {selected ? (
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="truncate">{selected.name}</span>
            {selected.is_default && (
              <Badge variant="outline" className="text-[10px] flex-shrink-0">
                Default
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">Seleccionar asunto...</span>
        )}
        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-full min-w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar asunto..." className="h-9" />
          <CommandList>
            <CommandEmpty>Sin asuntos</CommandEmpty>
            <CommandGroup>
              {matters.map((matter) => (
                <CommandItem
                  key={matter.id}
                  value={matter.name}
                  onSelect={() => {
                    onChange(matter.id)
                    setOpen(false)
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5",
                      value === matter.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex-1 truncate">{matter.name}</span>
                  <Badge variant="outline" className="text-[10px] ml-2">
                    {BILLING_TYPE_SHORT[matter.billing_type as BillingType] || "Por horas"}
                  </Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
