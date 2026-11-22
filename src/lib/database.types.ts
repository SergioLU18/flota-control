export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      archivos: {
        Row: {
          alto: number | null
          ancho: number | null
          bytes: number | null
          clave: string
          creado_en: string
          estado: string
          id: string
          subido_en: string | null
          subido_por: string
          tipo_mime: string
        }
        Insert: {
          alto?: number | null
          ancho?: number | null
          bytes?: number | null
          clave: string
          creado_en?: string
          estado?: string
          id?: string
          subido_en?: string | null
          subido_por?: string
          tipo_mime: string
        }
        Update: {
          alto?: number | null
          ancho?: number | null
          bytes?: number | null
          clave?: string
          creado_en?: string
          estado?: string
          id?: string
          subido_en?: string | null
          subido_por?: string
          tipo_mime?: string
        }
        Relationships: [
          {
            foreignKeyName: "archivos_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          accion: string | null
          antes: Json | null
          despues: Json | null
          en: string
          id: number
          modulo: string
          operacion: string
          registro_id: string
          tabla: string
          texto: string
          usuario_id: string | null
        }
        Insert: {
          accion?: string | null
          antes?: Json | null
          despues?: Json | null
          en?: string
          id?: never
          modulo?: never
          operacion: string
          registro_id: string
          tabla: string
          texto?: never
          usuario_id?: string | null
        }
        Update: {
          accion?: string | null
          antes?: Json | null
          despues?: Json | null
          en?: string
          id?: never
          modulo?: never
          operacion?: string
          registro_id?: string
          tabla?: string
          texto?: never
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      cargos: {
        Row: {
          cancelado_en: string | null
          cancelado_por: string | null
          concepto: string
          creado_en: string
          creado_por: string | null
          fecha: string
          id: string
          incidente_id: string | null
          monto: number
          motivo_cancelacion: string | null
          periodo_fin: string | null
          periodo_inicio: string | null
          renta_id: string
          tipo: string
        }
        Insert: {
          cancelado_en?: string | null
          cancelado_por?: string | null
          concepto: string
          creado_en?: string
          creado_por?: string | null
          fecha: string
          id?: string
          incidente_id?: string | null
          monto: number
          motivo_cancelacion?: string | null
          periodo_fin?: string | null
          periodo_inicio?: string | null
          renta_id: string
          tipo?: string
        }
        Update: {
          cancelado_en?: string | null
          cancelado_por?: string | null
          concepto?: string
          creado_en?: string
          creado_por?: string | null
          fecha?: string
          id?: string
          incidente_id?: string | null
          monto?: number
          motivo_cancelacion?: string | null
          periodo_fin?: string | null
          periodo_inicio?: string | null
          renta_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cargos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_incidente_id_fkey"
            columns: ["incidente_id"]
            isOneToOne: false
            referencedRelation: "incidentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_renta_id_fkey"
            columns: ["renta_id"]
            isOneToOne: false
            referencedRelation: "rentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_renta_id_fkey"
            columns: ["renta_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_rentas"
            referencedColumns: ["renta_id"]
          },
        ]
      }
      catalogo_permisos: {
        Row: {
          clave: string
          descripcion: string
          modulo: string
          nombre: string
          orden: number
          requiere: string[]
        }
        Insert: {
          clave: string
          descripcion?: string
          modulo: string
          nombre: string
          orden: number
          requiere?: string[]
        }
        Update: {
          clave?: string
          descripcion?: string
          modulo?: string
          nombre?: string
          orden?: number
          requiere?: string[]
        }
        Relationships: []
      }
      conductores: {
        Row: {
          actualizado_en: string
          correo: string | null
          creado_en: string
          curp: string | null
          domicilio: string
          id: string
          licencia_numero: string | null
          licencia_vence: string | null
          nombre: string
          notas: string
          telefono: string
        }
        Insert: {
          actualizado_en?: string
          correo?: string | null
          creado_en?: string
          curp?: string | null
          domicilio?: string
          id?: string
          licencia_numero?: string | null
          licencia_vence?: string | null
          nombre: string
          notas?: string
          telefono?: string
        }
        Update: {
          actualizado_en?: string
          correo?: string | null
          creado_en?: string
          curp?: string | null
          domicilio?: string
          id?: string
          licencia_numero?: string | null
          licencia_vence?: string | null
          nombre?: string
          notas?: string
          telefono?: string
        }
        Relationships: []
      }
      documentos_conductor: {
        Row: {
          actualizado_en: string
          archivo_id: string
          conductor_id: string
          creado_en: string
          id: string
          subido_por: string
          tipo: string
          vence: string | null
        }
        Insert: {
          actualizado_en?: string
          archivo_id: string
          conductor_id: string
          creado_en?: string
          id?: string
          subido_por?: string
          tipo: string
          vence?: string | null
        }
        Update: {
          actualizado_en?: string
          archivo_id?: string
          conductor_id?: string
          creado_en?: string
          id?: string
          subido_por?: string
          tipo?: string
          vence?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_conductor_archivo_id_fkey"
            columns: ["archivo_id"]
            isOneToOne: false
            referencedRelation: "archivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_conductor_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "conductores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_conductor_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "v_licencias"
            referencedColumns: ["conductor_id"]
          },
          {
            foreignKeyName: "documentos_conductor_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      fotos: {
        Row: {
          archivo_id: string
          con_danio: boolean
          creado_en: string
          etiqueta: string
          id: string
          incidente_id: string | null
          inspeccion_id: string | null
          orden: number
        }
        Insert: {
          archivo_id: string
          con_danio?: boolean
          creado_en?: string
          etiqueta?: string
          id?: string
          incidente_id?: string | null
          inspeccion_id?: string | null
          orden?: number
        }
        Update: {
          archivo_id?: string
          con_danio?: boolean
          creado_en?: string
          etiqueta?: string
          id?: string
          incidente_id?: string | null
          inspeccion_id?: string | null
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "fotos_archivo_id_fkey"
            columns: ["archivo_id"]
            isOneToOne: false
            referencedRelation: "archivos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fotos_incidente_id_fkey"
            columns: ["incidente_id"]
            isOneToOne: false
            referencedRelation: "incidentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fotos_inspeccion_id_fkey"
            columns: ["inspeccion_id"]
            isOneToOne: false
            referencedRelation: "inspecciones"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          actualizado_en: string
          cancelado_en: string | null
          cancelado_por: string | null
          categoria: string
          concepto: string
          creado_en: string
          fecha: string
          id: string
          monto: number
          motivo_cancelacion: string | null
          registrado_por: string | null
          vehiculo_id: string | null
        }
        Insert: {
          actualizado_en?: string
          cancelado_en?: string | null
          cancelado_por?: string | null
          categoria: string
          concepto: string
          creado_en?: string
          fecha: string
          id?: string
          monto: number
          motivo_cancelacion?: string | null
          registrado_por?: string | null
          vehiculo_id?: string | null
        }
        Update: {
          actualizado_en?: string
          cancelado_en?: string | null
          cancelado_por?: string | null
          categoria?: string
          concepto?: string
          creado_en?: string
          fecha?: string
          id?: string
          monto?: number
          motivo_cancelacion?: string | null
          registrado_por?: string | null
          vehiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_mantenimiento"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "gastos_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_posiciones: {
        Row: {
          actualizado_en: string
          datos: Json
          estado: string | null
          imei: string | null
          lat: number | null
          lng: number | null
          nombre: string
          odometro: number | null
          orion_equipo_id: string
          placas: string | null
          reportado_en: string | null
          rumbo: number | null
          vehiculo_id: string | null
          velocidad: number | null
        }
        Insert: {
          actualizado_en?: string
          datos?: Json
          estado?: string | null
          imei?: string | null
          lat?: number | null
          lng?: number | null
          nombre?: string
          odometro?: number | null
          orion_equipo_id: string
          placas?: string | null
          reportado_en?: string | null
          rumbo?: number | null
          vehiculo_id?: string | null
          velocidad?: number | null
        }
        Update: {
          actualizado_en?: string
          datos?: Json
          estado?: string | null
          imei?: string | null
          lat?: number | null
          lng?: number | null
          nombre?: string
          odometro?: number | null
          orion_equipo_id?: string
          placas?: string | null
          reportado_en?: string | null
          rumbo?: number | null
          vehiculo_id?: string | null
          velocidad?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gps_posiciones_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_mantenimiento"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "gps_posiciones_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      incidentes: {
        Row: {
          actualizado_en: string
          cerrado_en: string | null
          cerrado_por: string | null
          conductor_id: string | null
          costo: number
          creado_en: string
          descripcion: string
          estado: string
          fecha: string
          id: string
          registrado_por: string | null
          renta_id: string | null
          responsable: string
          tipo: string
          vehiculo_id: string
        }
        Insert: {
          actualizado_en?: string
          cerrado_en?: string | null
          cerrado_por?: string | null
          conductor_id?: string | null
          costo?: number
          creado_en?: string
          descripcion?: string
          estado?: string
          fecha: string
          id?: string
          registrado_por?: string | null
          renta_id?: string | null
          responsable: string
          tipo: string
          vehiculo_id: string
        }
        Update: {
          actualizado_en?: string
          cerrado_en?: string | null
          cerrado_por?: string | null
          conductor_id?: string | null
          costo?: number
          creado_en?: string
          descripcion?: string
          estado?: string
          fecha?: string
          id?: string
          registrado_por?: string | null
          renta_id?: string | null
          responsable?: string
          tipo?: string
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidentes_cerrado_por_fkey"
            columns: ["cerrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidentes_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "conductores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidentes_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "v_licencias"
            referencedColumns: ["conductor_id"]
          },
          {
            foreignKeyName: "incidentes_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidentes_renta_id_vehiculo_id_fkey"
            columns: ["renta_id", "vehiculo_id"]
            isOneToOne: false
            referencedRelation: "rentas"
            referencedColumns: ["id", "vehiculo_id"]
          },
          {
            foreignKeyName: "incidentes_renta_id_vehiculo_id_fkey"
            columns: ["renta_id", "vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_rentas"
            referencedColumns: ["renta_id", "vehiculo_id"]
          },
          {
            foreignKeyName: "incidentes_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_mantenimiento"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "incidentes_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      inspecciones: {
        Row: {
          combustible: number
          creado_en: string
          fecha: string
          id: string
          km: number
          notas: string
          registrado_por: string | null
          renta_id: string | null
          tipo: string
          vehiculo_id: string
        }
        Insert: {
          combustible: number
          creado_en?: string
          fecha: string
          id?: string
          km: number
          notas?: string
          registrado_por?: string | null
          renta_id?: string | null
          tipo: string
          vehiculo_id: string
        }
        Update: {
          combustible?: number
          creado_en?: string
          fecha?: string
          id?: string
          km?: number
          notas?: string
          registrado_por?: string | null
          renta_id?: string | null
          tipo?: string
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspecciones_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspecciones_renta_id_vehiculo_id_fkey"
            columns: ["renta_id", "vehiculo_id"]
            isOneToOne: false
            referencedRelation: "rentas"
            referencedColumns: ["id", "vehiculo_id"]
          },
          {
            foreignKeyName: "inspecciones_renta_id_vehiculo_id_fkey"
            columns: ["renta_id", "vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_rentas"
            referencedColumns: ["renta_id", "vehiculo_id"]
          },
          {
            foreignKeyName: "inspecciones_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_mantenimiento"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "inspecciones_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      llantas: {
        Row: {
          anio_dot: number | null
          fecha_instalacion: string
          id: string
          km_instalacion: number
          km_retiro: number | null
          marca: string
          posicion: string
          retirada_en: string | null
          servicio_id: string | null
          vehiculo_id: string
        }
        Insert: {
          anio_dot?: number | null
          fecha_instalacion: string
          id?: string
          km_instalacion: number
          km_retiro?: number | null
          marca: string
          posicion: string
          retirada_en?: string | null
          servicio_id?: string | null
          vehiculo_id: string
        }
        Update: {
          anio_dot?: number | null
          fecha_instalacion?: string
          id?: string
          km_instalacion?: number
          km_retiro?: number | null
          marca?: string
          posicion?: string
          retirada_en?: string | null
          servicio_id?: string | null
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "llantas_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llantas_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "v_mantenimiento"
            referencedColumns: ["ultimo_servicio_id"]
          },
          {
            foreignKeyName: "llantas_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_mantenimiento"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "llantas_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      orion_sincronizaciones: {
        Row: {
          estado: string
          id: string
          iniciada_en: string
          lecturas_descartadas: Json
          nota: string
          origen: string
          terminada_en: string | null
          vehiculos_actualizados: number
        }
        Insert: {
          estado?: string
          id?: string
          iniciada_en?: string
          lecturas_descartadas?: Json
          nota?: string
          origen?: string
          terminada_en?: string | null
          vehiculos_actualizados?: number
        }
        Update: {
          estado?: string
          id?: string
          iniciada_en?: string
          lecturas_descartadas?: Json
          nota?: string
          origen?: string
          terminada_en?: string | null
          vehiculos_actualizados?: number
        }
        Relationships: []
      }
      pagos: {
        Row: {
          cancelado_en: string | null
          cancelado_por: string | null
          creado_en: string
          fecha: string
          id: string
          metodo: string
          monto: number
          motivo_cancelacion: string | null
          notas: string
          registrado_por: string
          renta_id: string
        }
        Insert: {
          cancelado_en?: string | null
          cancelado_por?: string | null
          creado_en?: string
          fecha: string
          id?: string
          metodo: string
          monto: number
          motivo_cancelacion?: string | null
          notas?: string
          registrado_por?: string
          renta_id: string
        }
        Update: {
          cancelado_en?: string | null
          cancelado_por?: string | null
          creado_en?: string
          fecha?: string
          id?: string
          metodo?: string
          monto?: number
          motivo_cancelacion?: string | null
          notas?: string
          registrado_por?: string
          renta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_cancelado_por_fkey"
            columns: ["cancelado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_renta_id_fkey"
            columns: ["renta_id"]
            isOneToOne: false
            referencedRelation: "rentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_renta_id_fkey"
            columns: ["renta_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_rentas"
            referencedColumns: ["renta_id"]
          },
        ]
      }
      plantillas_permisos: {
        Row: {
          activa: boolean
          actualizado_en: string
          creado_en: string
          descripcion: string
          id: string
          nombre: string
          orden: number
          permisos: string[]
        }
        Insert: {
          activa?: boolean
          actualizado_en?: string
          creado_en?: string
          descripcion?: string
          id?: string
          nombre: string
          orden?: number
          permisos?: string[]
        }
        Update: {
          activa?: boolean
          actualizado_en?: string
          creado_en?: string
          descripcion?: string
          id?: string
          nombre?: string
          orden?: number
          permisos?: string[]
        }
        Relationships: []
      }
      referencias_conductor: {
        Row: {
          conductor_id: string
          id: string
          nombre: string
          orden: number
          parentesco: string
          telefono: string
        }
        Insert: {
          conductor_id: string
          id?: string
          nombre: string
          orden?: number
          parentesco?: string
          telefono?: string
        }
        Update: {
          conductor_id?: string
          id?: string
          nombre?: string
          orden?: number
          parentesco?: string
          telefono?: string
        }
        Relationships: [
          {
            foreignKeyName: "referencias_conductor_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "conductores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referencias_conductor_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "v_licencias"
            referencedColumns: ["conductor_id"]
          },
        ]
      }
      registros_km: {
        Row: {
          creado_en: string
          fecha: string
          id: string
          km: number
          origen: string
          registrado_por: string | null
          renta_id: string | null
          sincronizacion_id: string | null
          vehiculo_id: string
        }
        Insert: {
          creado_en?: string
          fecha: string
          id?: string
          km: number
          origen: string
          registrado_por?: string | null
          renta_id?: string | null
          sincronizacion_id?: string | null
          vehiculo_id: string
        }
        Update: {
          creado_en?: string
          fecha?: string
          id?: string
          km?: number
          origen?: string
          registrado_por?: string | null
          renta_id?: string | null
          sincronizacion_id?: string | null
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registros_km_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_km_renta_id_vehiculo_id_fkey"
            columns: ["renta_id", "vehiculo_id"]
            isOneToOne: false
            referencedRelation: "rentas"
            referencedColumns: ["id", "vehiculo_id"]
          },
          {
            foreignKeyName: "registros_km_renta_id_vehiculo_id_fkey"
            columns: ["renta_id", "vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_rentas"
            referencedColumns: ["renta_id", "vehiculo_id"]
          },
          {
            foreignKeyName: "registros_km_sincronizacion_id_fkey"
            columns: ["sincronizacion_id"]
            isOneToOne: false
            referencedRelation: "orion_sincronizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_km_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_mantenimiento"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "registros_km_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      rentas: {
        Row: {
          actualizado_en: string
          conductor_id: string
          creada_por: string | null
          creado_en: string
          deposito: number
          deposito_estado: string
          estado: string
          fecha_fin: string | null
          fecha_inicio: string
          finalizada_por: string | null
          id: string
          km_devolucion: number | null
          km_entrega: number
          notas: string
          tarifa_semanal: number
          vehiculo_id: string
        }
        Insert: {
          actualizado_en?: string
          conductor_id: string
          creada_por?: string | null
          creado_en?: string
          deposito?: number
          deposito_estado?: string
          estado?: string
          fecha_fin?: string | null
          fecha_inicio: string
          finalizada_por?: string | null
          id?: string
          km_devolucion?: number | null
          km_entrega: number
          notas?: string
          tarifa_semanal: number
          vehiculo_id: string
        }
        Update: {
          actualizado_en?: string
          conductor_id?: string
          creada_por?: string | null
          creado_en?: string
          deposito?: number
          deposito_estado?: string
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          finalizada_por?: string | null
          id?: string
          km_devolucion?: number | null
          km_entrega?: number
          notas?: string
          tarifa_semanal?: number
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rentas_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "conductores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentas_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "v_licencias"
            referencedColumns: ["conductor_id"]
          },
          {
            foreignKeyName: "rentas_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentas_finalizada_por_fkey"
            columns: ["finalizada_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentas_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_mantenimiento"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "rentas_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      servicios: {
        Row: {
          actualizado_en: string
          costo: number
          creado_en: string
          fecha: string
          id: string
          km: number
          notas: string
          registrado_por: string | null
          reinicia_contador: boolean
          taller: string
          tipo_servicio_id: string
          vehiculo_id: string
        }
        Insert: {
          actualizado_en?: string
          costo?: number
          creado_en?: string
          fecha: string
          id?: string
          km: number
          notas?: string
          registrado_por?: string | null
          reinicia_contador: boolean
          taller?: string
          tipo_servicio_id: string
          vehiculo_id: string
        }
        Update: {
          actualizado_en?: string
          costo?: number
          creado_en?: string
          fecha?: string
          id?: string
          km?: number
          notas?: string
          registrado_por?: string | null
          reinicia_contador?: boolean
          taller?: string
          tipo_servicio_id?: string
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "servicios_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_tipo_servicio_id_fkey"
            columns: ["tipo_servicio_id"]
            isOneToOne: false
            referencedRelation: "tipos_servicio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_mantenimiento"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "servicios_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_servicio: {
        Row: {
          activo: boolean
          descripcion: string
          id: string
          nombre: string
          orden: number
          reinicia_contador: boolean
        }
        Insert: {
          activo?: boolean
          descripcion?: string
          id?: string
          nombre: string
          orden?: number
          reinicia_contador?: boolean
        }
        Update: {
          activo?: boolean
          descripcion?: string
          id?: string
          nombre?: string
          orden?: number
          reinicia_contador?: boolean
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          activo: boolean
          actualizado_en: string
          correo: string
          creado_en: string
          id: string
          nombre: string
          permisos: string[]
          rol: string
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          correo: string
          creado_en?: string
          id: string
          nombre: string
          permisos?: string[]
          rol?: string
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          correo?: string
          creado_en?: string
          id?: string
          nombre?: string
          permisos?: string[]
          rol?: string
        }
        Relationships: []
      }
      vehiculos: {
        Row: {
          actualizado_en: string
          anio: number
          color: string
          creado_en: string
          estado: string
          fecha_compra: string | null
          id: string
          km_actual: number
          marca: string
          modelo: string
          notas: string
          orion_equipo_id: string | null
          placas: string
          precio_compra: number | null
          unidad: string | null
          vin: string | null
        }
        Insert: {
          actualizado_en?: string
          anio: number
          color?: string
          creado_en?: string
          estado?: string
          fecha_compra?: string | null
          id?: string
          km_actual?: number
          marca: string
          modelo: string
          notas?: string
          orion_equipo_id?: string | null
          placas: string
          precio_compra?: number | null
          unidad?: string | null
          vin?: string | null
        }
        Update: {
          actualizado_en?: string
          anio?: number
          color?: string
          creado_en?: string
          estado?: string
          fecha_compra?: string | null
          id?: string
          km_actual?: number
          marca?: string
          modelo?: string
          notas?: string
          orion_equipo_id?: string | null
          placas?: string
          precio_compra?: number | null
          unidad?: string | null
          vin?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_licencias: {
        Row: {
          conductor_id: string | null
          dias_para_vencer: number | null
          licencia_vence: string | null
          nivel: string | null
        }
        Insert: {
          conductor_id?: string | null
          dias_para_vencer?: never
          licencia_vence?: string | null
          nivel?: never
        }
        Update: {
          conductor_id?: string | null
          dias_para_vencer?: never
          licencia_vence?: string | null
          nivel?: never
        }
        Relationships: []
      }
      v_llantas_vigentes: {
        Row: {
          anio_dot: number | null
          fecha_instalacion: string | null
          id: string | null
          km_instalacion: number | null
          km_retiro: number | null
          marca: string | null
          posicion: string | null
          retirada_en: string | null
          servicio_id: string | null
          vehiculo_id: string | null
        }
        Insert: {
          anio_dot?: number | null
          fecha_instalacion?: string | null
          id?: string | null
          km_instalacion?: number | null
          km_retiro?: number | null
          marca?: string | null
          posicion?: string | null
          retirada_en?: string | null
          servicio_id?: string | null
          vehiculo_id?: string | null
        }
        Update: {
          anio_dot?: number | null
          fecha_instalacion?: string | null
          id?: string | null
          km_instalacion?: number | null
          km_retiro?: number | null
          marca?: string | null
          posicion?: string | null
          retirada_en?: string | null
          servicio_id?: string | null
          vehiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llantas_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llantas_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "v_mantenimiento"
            referencedColumns: ["ultimo_servicio_id"]
          },
          {
            foreignKeyName: "llantas_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_mantenimiento"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "llantas_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_mantenimiento: {
        Row: {
          km_actual: number | null
          km_desde_servicio: number | null
          km_proximo_servicio: number | null
          km_restantes: number | null
          nivel: string | null
          ultimo_servicio_fecha: string | null
          ultimo_servicio_id: string | null
          ultimo_servicio_km: number | null
          vehiculo_id: string | null
        }
        Relationships: []
      }
      v_saldos_conductores: {
        Row: {
          cargado: number | null
          conductor_id: string | null
          pagado: number | null
          saldo: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rentas_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "conductores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentas_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "v_licencias"
            referencedColumns: ["conductor_id"]
          },
        ]
      }
      v_saldos_rentas: {
        Row: {
          cargado: number | null
          conductor_id: string | null
          estado: string | null
          pagado: number | null
          renta_id: string | null
          saldo: number | null
          vehiculo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rentas_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "conductores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentas_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "v_licencias"
            referencedColumns: ["conductor_id"]
          },
          {
            foreignKeyName: "rentas_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_mantenimiento"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "rentas_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_saldos_vehiculos: {
        Row: {
          cargado: number | null
          pagado: number | null
          saldo: number | null
          vehiculo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rentas_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "v_mantenimiento"
            referencedColumns: ["vehiculo_id"]
          },
          {
            foreignKeyName: "rentas_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      agregar_fotos_incidente: {
        Args: { p_fotos: Json; p_incidente_id: string }
        Returns: undefined
      }
      cancelar_cargo: {
        Args: { p_cargo_id: string; p_motivo: string }
        Returns: undefined
      }
      cancelar_gasto: {
        Args: { p_gasto_id: string; p_motivo: string }
        Returns: undefined
      }
      cancelar_pago: {
        Args: { p_motivo: string; p_pago_id: string }
        Returns: undefined
      }
      corregir_cargo: {
        Args: { p_cargo_id: string; p_concepto: string; p_monto: number; p_motivo: string }
        Returns: undefined
      }
      corregir_km: {
        Args: { p_km: number; p_motivo: string; p_registro_id: string }
        Returns: undefined
      }
      editar_renta: {
        Args: {
          p_deposito: number
          p_renta_id: string
          p_tarifa_semanal: number
        }
        Returns: undefined
      }
      exigir_permiso: { Args: { p_permiso: string }; Returns: undefined }
      exigir_rol: { Args: { p_solo_admin?: boolean }; Returns: undefined }
      finalizar_renta: {
        Args: {
          p_deposito_estado: string
          p_fecha_fin?: string
          p_km_devolucion: number
          p_renta_id: string
        }
        Returns: number
      }
      generar_cargos: {
        Args: { p_hasta?: string; p_renta_id?: string }
        Returns: number
      }
      guardar_conductor: {
        Args: { p_datos: Json; p_id: string | null; p_referencias: Json }
        Returns: string
      }
      guardar_plantilla: {
        Args: { p_activa: boolean; p_descripcion: string; p_id: string | null; p_nombre: string; p_permisos: string[] }
        Returns: string
      }
      guardar_usuario: {
        Args: {
          p_activo: boolean
          p_id: string
          p_nombre: string
          p_permisos: string[]
          p_rol: string
        }
        Returns: undefined
      }
      guardar_vehiculo: {
        Args: { p_datos: Json; p_id: string | null }
        Returns: string
      }
      hoy_merida: { Args: never; Returns: string }
      iniciar_renta: {
        Args: {
          p_conductor_id: string
          p_deposito?: number
          p_fecha_inicio?: string
          p_km_entrega?: number
          p_notas?: string
          p_tarifa_semanal: number
          p_vehiculo_id: string
        }
        Returns: string
      }
      precios_compra: {
        Args: never
        Returns: { precio_compra: number | null; vehiculo_id: string }[]
      }
      registrar_incidente: {
        Args: { p_datos: Json; p_fotos?: Json; p_id: string }
        Returns: string
      }
      registrar_inspeccion: {
        Args: { p_datos: Json; p_fotos?: Json; p_id: string }
        Returns: string
      }
      registrar_servicio: {
        Args: { p_datos: Json; p_id: string; p_llantas?: Json }
        Returns: string
      }
      rentas_basicas: {
        Args: never
        Returns: {
          conductor_id: string
          estado: string
          fecha_fin: string | null
          fecha_inicio: string
          id: string
          km_devolucion: number | null
          km_entrega: number
          vehiculo_id: string
        }[]
      }
      resolver_deposito: {
        Args: { p_estado: string; p_renta_id: string }
        Returns: number
      }
      normalizar_permisos: { Args: { p_permisos: string[] }; Returns: string[] }
      rol_actual: { Args: never; Returns: string }
      tiene_alguno: { Args: { p_permisos: string[] }; Returns: boolean }
      tiene_permiso: { Args: { p_permiso: string }; Returns: boolean }
      validar_usuario: {
        Args: { p_id: string; p_permisos: string[]; p_rol: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
