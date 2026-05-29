"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { ChevronsUpDown, Check, Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Client } from "@/lib/types"

interface ClientSelectorProps {
  clients: Client[]
  value: string | null
  onChange: (clientId: string) => void
}

export function ClientSelector({ clients, value, onChange }: ClientSelectorProps) {
  const [open, setOpen] = useState(false)
  const selected = clients.find((c) => c.id === value)

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
            <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="truncate">{selected.name}</span>
            <Badge variant="secondary" className="text-[10px] ml-auto flex-shrink-0">
              {selected.billing_type === "fee" ? "Paquete" : "Por horas"}
            </Badge>
          </div>
        ) : (
          <span className="text-muted-foreground">Seleccionar cliente...</span>
        )}
        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-full min-w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar cliente..." className="h-9" />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {clients.map((client) => (
                <CommandItem
                  key={client.id}
                  value={client.name}
                  onSelect={() => {
                    onChange(client.id)
                    setOpen(false)
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5",
                      value === client.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex-1 truncate">{client.name}</span>
                  <Badge variant="outline" className="text-[10px] ml-2">
                    {client.billing_type === "fee" ? "Paquete" : "Por horas"}
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
