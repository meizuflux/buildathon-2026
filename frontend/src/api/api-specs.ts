export namespace Haven {
    export namespace ApiAuthLoginLogin {
        export namespace Http200 {
            export type ResponseBody = {
                access_token: string;
                expires_at: string;
                token_type: "Bearer";
                user: {
                    family_id: null | string;
                    id: string;
                    role: "family" | "operator";
                };
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http429 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export type RequestBody = {
            email: string;
            password: string;
        };
    };

    export namespace ApiAuthLogoutLogout {
        export namespace Http204 {
            export type ResponseBody = undefined;
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };
    };

    export namespace ApiAuthRegisterRegister {
        export namespace Http201 {
            export type ResponseBody = {
                role: "family";
                user_id: string;
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http409 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export type RequestBody = {
            email: string;
            password: string;
        };
    };

    export namespace ApiDisastersDisasterIdActivityListActivity {
        export namespace Http200 {
            export type ResponseBody = {
                activity: {
                    actor: {
                        id: string;
                        kind: string;
                        name: string;
                    };
                    created_at: string;
                    disaster_id: string;
                    id: string;
                    ref: {
                        id: string;
                        kind: string;
                    };
                    summary: string;
                    type: string;
                } [];
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface PathParameters {
            disaster_id: string;
        };

        export interface QueryParameters {
            limit ? : number;
        };
    };

    export namespace ApiDisastersDisasterIdAlertsListAlerts {
        export namespace Http200 {
            export type ResponseBody = {
                alerts: {
                    code: string;
                    details: {

                    };
                    disaster_id: string;
                    family_id: null | string;
                    id: string;
                    message: string;
                    severity: "critical" | "info" | "warning";
                    shelter_id: null | string;
                    updated_at: string;
                } [];
                limit: number;
                offset: number;
                total: number;
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface PathParameters {
            disaster_id: string;
        };

        export interface QueryParameters {
            limit ? : number;
            offset ? : number;
        };
    };

    export namespace ApiDisastersDisasterIdEvacuationPreviewEvacuationPreview {
        export namespace Http200 {
            export type ResponseBody = {
                disaster_id: string;
                generated_at: string;
                households: {
                    family_id: string;
                    has_car: boolean;
                    location: {
                        latitude: number;
                        longitude: number;
                    };
                    naive: {
                        distance_km: null | number;
                        shelter_id: null | string;
                        unmet: ("child_friendly" | "medical_staff" | "medication" | "pets" | "special_care" | "wheelchair_accessible")[];
                    };
                    people: number;
                    personalized: {
                        distance_km: null | number;
                        shelter_id: null | string;
                        unmet: ("child_friendly" | "medical_staff" | "medication" | "pets" | "special_care" | "wheelchair_accessible")[];
                    };
                    requirements: ("child_friendly" | "medical_staff" | "medication" | "pets" | "special_care" | "wheelchair_accessible")[];
                } [];
                naive: {
                    households: number;
                    households_with_needs: number;
                    idle_shelters: number;
                    max_utilization: null | number;
                    min_utilization: null | number;
                    needs: {
                        households: number;
                        requirement: "child_friendly" | "medical_staff" | "medication" | "pets" | "special_care" | "wheelchair_accessible";
                        unmet_households: number;
                    } [];
                    overcrowded_shelters: number;
                    people: number;
                    people_over_capacity: number;
                    shelters: {
                        name: string;
                        people: number;
                        people_over_capacity: number;
                        shelter_id: string;
                        total_people: number;
                        unmet_households: number;
                        utilization: null | number;
                    } [];
                    travel: {
                        max_km: null | number;
                        mean_km: null | number;
                        no_car_mean_km: null | number;
                        p95_km: null | number;
                        total_km: number;
                    };
                    unassigned_households: number;
                    unmet_households: number;
                };
                personalized: {
                    households: number;
                    households_with_needs: number;
                    idle_shelters: number;
                    max_utilization: null | number;
                    min_utilization: null | number;
                    needs: {
                        households: number;
                        requirement: "child_friendly" | "medical_staff" | "medication" | "pets" | "special_care" | "wheelchair_accessible";
                        unmet_households: number;
                    } [];
                    overcrowded_shelters: number;
                    people: number;
                    people_over_capacity: number;
                    shelters: {
                        name: string;
                        people: number;
                        people_over_capacity: number;
                        shelter_id: string;
                        total_people: number;
                        unmet_households: number;
                        utilization: null | number;
                    } [];
                    travel: {
                        max_km: null | number;
                        mean_km: null | number;
                        no_car_mean_km: null | number;
                        p95_km: null | number;
                        total_km: number;
                    };
                    unassigned_households: number;
                    unmet_households: number;
                };
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                detail: string;
                extra ? : Record < string,
                unknown > | null | unknown[];
                status_code: number;
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface PathParameters {
            disaster_id: string;
        };
    };

    export namespace ApiDisastersDisasterIdHurricaneGetHurricane {
        export namespace Http200 {
            export type ResponseBody = {
                disaster_id: string;
                hurricane: null | {
                    category: number;
                    name: string;
                };
                phase: "active" | "peace";
                started_at: null | string;
                updated_at: null | string;
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                detail: string;
                extra ? : Record < string,
                unknown > | null | unknown[];
                status_code: number;
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface PathParameters {
            disaster_id: string;
        };
    };

    export namespace ApiDisastersDisasterIdHurricaneInitiateInitiateHurricane {
        export namespace Http200 {
            export type ResponseBody = {
                disaster_id: string;
                hurricane: null | {
                    category: number;
                    name: string;
                };
                phase: "active" | "peace";
                started_at: null | string;
                updated_at: null | string;
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http409 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface PathParameters {
            disaster_id: string;
        };

        export type RequestBody = null | {
            category ? : number;
            name ? : string;
        };
    };

    export namespace ApiDisastersDisasterIdHurricaneResetResetHurricane {
        export namespace Http200 {
            export type ResponseBody = {
                disaster_id: string;
                hurricane: null | {
                    category: number;
                    name: string;
                };
                phase: "active" | "peace";
                started_at: null | string;
                updated_at: null | string;
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                detail: string;
                extra ? : Record < string,
                unknown > | null | unknown[];
                status_code: number;
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface PathParameters {
            disaster_id: string;
        };
    };

    export namespace ApiDisastersDisasterIdPlansListPlans {
        export namespace Http200 {
            export type ResponseBody = {
                limit: number;
                offset: number;
                plans: {
                    alerts: {
                        assigned_people ? : number;
                        code: string;
                        message: string;
                        people_over_allocation_budget ? : number;
                        people_over_capacity ? : number;
                        severity: "critical" | "warning";
                        shelter_id ? : string;
                        shelter_name ? : string;
                        total_people ? : number;
                        unmet_requirements ? : string[];
                    } [];
                    capacity_reserved: boolean;
                    disaster_id: string;
                    family_id: string;
                    instructions: string[];
                    reason: string;
                    shelter: null | {
                        address: string;
                        capabilities: {
                            child_friendly: boolean;
                            medical_staff: string[];
                            pets_allowed: boolean;
                            special_care_notes: null | string;
                            wheelchair_accessible: boolean;
                        };
                        capacity: {
                            total_people: number;
                        };
                        id: string;
                        location: {
                            latitude: number;
                            longitude: number;
                        };
                        name: string;
                        resources: {
                            clothes: "available" | "limited" | "unavailable" | "unknown";
                            food: "available" | "limited" | "unavailable" | "unknown";
                            medication: "available" | "limited" | "unavailable" | "unknown";
                            water: "available" | "limited" | "unavailable" | "unknown";
                        };
                        status: "closed" | "full" | "open";
                    };
                    status: "no_match" | "recommended";
                    updated_at: string;
                    version: number;
                } [];
                total: number;
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface PathParameters {
            disaster_id: string;
        };

        export interface QueryParameters {
            limit ? : number;
            offset ? : number;
        };
    };

    export namespace ApiDisastersDisasterIdReportsListReports {
        export namespace Http200 {
            export type ResponseBody = {
                reports: {
                    client_request_id: string;
                    created_at: string;
                    family_id: string;
                    id: string;
                    location: null | {
                        latitude: number;
                        longitude: number;
                    };
                    message: string;
                    status: "acknowledged" | "received" | "resolved";
                    type: "need_help" | "other" | "resource_request" | "status_update";
                } [];
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface PathParameters {
            disaster_id: string;
        };
    };

    export namespace ApiDisastersDisasterIdUpdatesListUpdates {
        export namespace Http200 {
            export type ResponseBody = {
                updates: {
                    disaster_id: string;
                    id: string;
                    message: string;
                    published_at: string;
                    severity: "critical" | "info" | "warning";
                    target ? : {

                    };
                    title: string;
                } [];
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface PathParameters {
            disaster_id: string;
        };
    };

    export namespace ApiDisastersDisasterIdUpdatesPreviewPreviewUpdate {
        export namespace Http200 {
            export type ResponseBody = {
                recipient_count: number;
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface PathParameters {
            disaster_id: string;
        };

        export type RequestBody = {
            target: {
                shelter_id ? : null | string;
                type: "all" | "shelter";
            };
        };
    };

    export namespace ApiDisastersDisasterIdUpdatesPublishUpdate {
        export namespace Http201 {
            export type ResponseBody = {
                disaster_id: string;
                id: string;
                message: string;
                published_at: string;
                severity: "critical" | "info" | "warning";
                target ? : {

                };
                title: string;
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface PathParameters {
            disaster_id: string;
        };

        export type RequestBody = {
            message: string;
            severity: "critical" | "info" | "warning";
            target ? : null | {
                shelter_id ? : null | string;
                type: "all" | "shelter";
            };
            title: string;
        };
    };

    export namespace ApiDisastersListDisasters {
        export namespace Http200 {
            export type ResponseBody = {
                disasters: {
                    affected_area: string;
                    id: string;
                    name: string;
                    status: string;
                    type: string;
                    updated_at: string;
                } [];
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };
    };

    export namespace ApiFamiliesCreateFamily {
        export namespace Http201 {
            export type ResponseBody = {
                adults: number;
                children: number;
                created_at: string;
                disaster_id: string;
                id: string;
                location: {
                    latitude: number;
                    longitude: number;
                };
                needs: {
                    accessibility_notes: null | string;
                    immediate_medication: boolean;
                    medical_notes: null | string;
                    other_special_care: null | string;
                    pets: boolean;
                };
                resources: {
                    has_car: boolean;
                };
                updated_at: string;
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http409 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export type RequestBody = {
            adults: number;
            children: number;
            disaster_id: string;
            location: {
                latitude: number;
                longitude: number;
            };
            needs ? : {
                accessibility_notes ? : null | string;
                immediate_medication ? : boolean;
                medical_notes ? : null | string;
                other_special_care ? : null | string;
                pets ? : boolean;
            };
            resources ? : {
                has_car ? : boolean;
            };
        };
    };

    export namespace ApiFamiliesFamilyIdGetFamily {
        export namespace Http200 {
            export type ResponseBody = {
                adults: number;
                children: number;
                created_at: string;
                disaster_id: string;
                id: string;
                location: {
                    latitude: number;
                    longitude: number;
                };
                needs: {
                    accessibility_notes: null | string;
                    immediate_medication: boolean;
                    medical_notes: null | string;
                    other_special_care: null | string;
                    pets: boolean;
                };
                resources: {
                    has_car: boolean;
                };
                updated_at: string;
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface PathParameters {
            family_id: string;
        };
    };

    export namespace ApiFamiliesFamilyIdPatchFamily {
        export namespace Http200 {
            export type ResponseBody = {
                adults: number;
                children: number;
                created_at: string;
                disaster_id: string;
                id: string;
                location: {
                    latitude: number;
                    longitude: number;
                };
                needs: {
                    accessibility_notes: null | string;
                    immediate_medication: boolean;
                    medical_notes: null | string;
                    other_special_care: null | string;
                    pets: boolean;
                };
                resources: {
                    has_car: boolean;
                };
                updated_at: string;
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface PathParameters {
            family_id: string;
        };

        export type RequestBody = {
            adults ? : number;
            children ? : number;
            disaster_id ? : string;
            location ? : {
                latitude ? : number;
                longitude ? : number;
            };
            needs ? : {
                accessibility_notes ? : null | string;
                immediate_medication ? : boolean;
                medical_notes ? : null | string;
                other_special_care ? : null | string;
                pets ? : boolean;
            };
            resources ? : {
                has_car ? : boolean;
            };
        };
    };

    export namespace ApiFamiliesFamilyIdPlanGenerateGeneratePlan {
        export namespace Http200 {
            export type ResponseBody = {
                alerts: {
                    assigned_people ? : number;
                    code: string;
                    message: string;
                    people_over_allocation_budget ? : number;
                    people_over_capacity ? : number;
                    severity: "critical" | "warning";
                    shelter_id ? : string;
                    shelter_name ? : string;
                    total_people ? : number;
                    unmet_requirements ? : string[];
                } [];
                capacity_reserved: boolean;
                disaster_id: string;
                family_id: string;
                instructions: string[];
                reason: string;
                shelter: null | {
                    address: string;
                    capabilities: {
                        child_friendly: boolean;
                        medical_staff: string[];
                        pets_allowed: boolean;
                        special_care_notes: null | string;
                        wheelchair_accessible: boolean;
                    };
                    capacity: {
                        total_people: number;
                    };
                    id: string;
                    location: {
                        latitude: number;
                        longitude: number;
                    };
                    name: string;
                    resources: {
                        clothes: "available" | "limited" | "unavailable" | "unknown";
                        food: "available" | "limited" | "unavailable" | "unknown";
                        medication: "available" | "limited" | "unavailable" | "unknown";
                        water: "available" | "limited" | "unavailable" | "unknown";
                    };
                    status: "closed" | "full" | "open";
                };
                status: "no_match" | "recommended";
                updated_at: string;
                version: number;
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface PathParameters {
            family_id: string;
        };
    };

    export namespace ApiFamiliesFamilyIdPlanGetPlan {
        export namespace Http200 {
            export type ResponseBody = {
                alerts: {
                    assigned_people ? : number;
                    code: string;
                    message: string;
                    people_over_allocation_budget ? : number;
                    people_over_capacity ? : number;
                    severity: "critical" | "warning";
                    shelter_id ? : string;
                    shelter_name ? : string;
                    total_people ? : number;
                    unmet_requirements ? : string[];
                } [];
                capacity_reserved: boolean;
                disaster_id: string;
                family_id: string;
                instructions: string[];
                reason: string;
                shelter: null | {
                    address: string;
                    capabilities: {
                        child_friendly: boolean;
                        medical_staff: string[];
                        pets_allowed: boolean;
                        special_care_notes: null | string;
                        wheelchair_accessible: boolean;
                    };
                    capacity: {
                        total_people: number;
                    };
                    id: string;
                    location: {
                        latitude: number;
                        longitude: number;
                    };
                    name: string;
                    resources: {
                        clothes: "available" | "limited" | "unavailable" | "unknown";
                        food: "available" | "limited" | "unavailable" | "unknown";
                        medication: "available" | "limited" | "unavailable" | "unknown";
                        water: "available" | "limited" | "unavailable" | "unknown";
                    };
                    status: "closed" | "full" | "open";
                };
                status: "no_match" | "recommended";
                updated_at: string;
                version: number;
            };
        };

        export namespace Http204 {
            export type ResponseBody = undefined;
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface PathParameters {
            family_id: string;
        };

        export interface QueryParameters {
            after_version ? : null | number;
            wait_seconds ? : number;
        };
    };

    export namespace ApiFamiliesFamilyIdReportsCreateReport {
        export namespace Http201 {
            export type ResponseBody = {
                client_request_id: string;
                created_at: string;
                family_id: string;
                id: string;
                location: null | {
                    latitude: number;
                    longitude: number;
                };
                message: string;
                status: "acknowledged" | "received" | "resolved";
                type: "need_help" | "other" | "resource_request" | "status_update";
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http409 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface PathParameters {
            family_id: string;
        };

        export type RequestBody = {
            client_request_id: string;
            location: {
                latitude: number;
                longitude: number;
            };
            message: string;
            type: "need_help" | "other" | "resource_request" | "status_update";
        };
    };

    export namespace ApiFamiliesListFamilies {
        export namespace Http200 {
            export type ResponseBody = {
                families: {
                    adults: number;
                    children: number;
                    created_at: string;
                    disaster_id: string;
                    id: string;
                    location: {
                        latitude: number;
                        longitude: number;
                    };
                    needs: {
                        accessibility_notes: null | string;
                        immediate_medication: boolean;
                        medical_notes: null | string;
                        other_special_care: null | string;
                        pets: boolean;
                    };
                    resources: {
                        has_car: boolean;
                    };
                    updated_at: string;
                } [];
                limit: number;
                offset: number;
                total: number;
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface QueryParameters {
            disaster_id: string;
            limit ? : number;
            offset ? : number;
        };
    };

    export namespace ApiMeMe {
        export namespace Http200 {
            export type ResponseBody = {
                family_id: null | string;
                id: string;
                role: "family" | "operator";
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };
    };

    export namespace ApiReportsReportIdUpdateReport {
        export namespace Http200 {
            export type ResponseBody = {
                client_request_id: string;
                created_at: string;
                family_id: string;
                id: string;
                location: null | {
                    latitude: number;
                    longitude: number;
                };
                message: string;
                status: "acknowledged" | "received" | "resolved";
                type: "need_help" | "other" | "resource_request" | "status_update";
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface PathParameters {
            report_id: string;
        };

        export type RequestBody = {
            status: "acknowledged" | "received" | "resolved";
        };
    };

    export namespace ApiSheltersCreateShelter {
        export namespace Http201 {
            export type ResponseBody = {
                address: string;
                capabilities: {
                    child_friendly: boolean;
                    medical_staff: string[];
                    pets_allowed: boolean;
                    special_care_notes: null | string;
                    wheelchair_accessible: boolean;
                };
                capacity: {
                    available_people: number;
                    total_people: number;
                };
                disaster_id: string;
                id: string;
                location: {
                    latitude: number;
                    longitude: number;
                };
                name: string;
                resources: {
                    clothes: "available" | "limited" | "unavailable" | "unknown";
                    food: "available" | "limited" | "unavailable" | "unknown";
                    medication: "available" | "limited" | "unavailable" | "unknown";
                    water: "available" | "limited" | "unavailable" | "unknown";
                };
                status: "closed" | "full" | "open";
                updated_at: string;
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export type RequestBody = {
            address: string;
            capabilities: {
                child_friendly ? : boolean;
                medical_staff ? : string[];
                pets_allowed ? : boolean;
                special_care_notes ? : null | string;
                wheelchair_accessible ? : boolean;
            };
            capacity: {
                available_people: number;
                total_people: number;
            };
            disaster_id: string;
            location: {
                latitude: number;
                longitude: number;
            };
            name: string;
            resources: {
                clothes ? : "available" | "limited" | "unavailable" | "unknown";
                food ? : "available" | "limited" | "unavailable" | "unknown";
                medication ? : "available" | "limited" | "unavailable" | "unknown";
                water ? : "available" | "limited" | "unavailable" | "unknown";
            };
            status: "closed" | "full" | "open";
        };
    };

    export namespace ApiSheltersListShelters {
        export namespace Http200 {
            export type ResponseBody = {
                shelters: {
                    address: string;
                    capabilities: {
                        child_friendly: boolean;
                        medical_staff: string[];
                        pets_allowed: boolean;
                        special_care_notes: null | string;
                        wheelchair_accessible: boolean;
                    };
                    capacity: {
                        available_people: number;
                        total_people: number;
                    };
                    disaster_id: string;
                    id: string;
                    location: {
                        latitude: number;
                        longitude: number;
                    };
                    name: string;
                    resources: {
                        clothes: "available" | "limited" | "unavailable" | "unknown";
                        food: "available" | "limited" | "unavailable" | "unknown";
                        medication: "available" | "limited" | "unavailable" | "unknown";
                        water: "available" | "limited" | "unavailable" | "unknown";
                    };
                    status: "closed" | "full" | "open";
                    updated_at: string;
                } [];
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface QueryParameters {
            disaster_id: string;
        };
    };

    export namespace ApiSheltersShelterIdUpdateShelter {
        export namespace Http200 {
            export type ResponseBody = {
                address: string;
                capabilities: {
                    child_friendly: boolean;
                    medical_staff: string[];
                    pets_allowed: boolean;
                    special_care_notes: null | string;
                    wheelchair_accessible: boolean;
                };
                capacity: {
                    available_people: number;
                    total_people: number;
                };
                disaster_id: string;
                id: string;
                location: {
                    latitude: number;
                    longitude: number;
                };
                name: string;
                resources: {
                    clothes: "available" | "limited" | "unavailable" | "unknown";
                    food: "available" | "limited" | "unavailable" | "unknown";
                    medication: "available" | "limited" | "unavailable" | "unknown";
                    water: "available" | "limited" | "unavailable" | "unknown";
                };
                status: "closed" | "full" | "open";
                updated_at: string;
            };
        };

        export namespace Http400 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http401 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http403 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http404 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };

        export interface PathParameters {
            shelter_id: string;
        };

        export type RequestBody = {
            address ? : string;
            capabilities ? : {
                child_friendly ? : boolean;
                medical_staff ? : string[];
                pets_allowed ? : boolean;
                special_care_notes ? : null | string;
                wheelchair_accessible ? : boolean;
            };
            capacity ? : {
                available_people ? : number;
                total_people ? : number;
            };
            disaster_id ? : string;
            location ? : {
                latitude ? : number;
                longitude ? : number;
            };
            name ? : string;
            resources ? : {
                clothes ? : "available" | "limited" | "unavailable" | "unknown";
                food ? : "available" | "limited" | "unavailable" | "unknown";
                medication ? : "available" | "limited" | "unavailable" | "unknown";
                water ? : "available" | "limited" | "unavailable" | "unknown";
            };
            status ? : "closed" | "full" | "open";
        };
    };

    export namespace HealthHealth {
        export namespace Http200 {
            export type ResponseBody = {

            };
        };

        export namespace Http500 {
            export type ResponseBody = {
                error: {
                    code: string;
                    message: string;
                };
            };
        };
    };
};