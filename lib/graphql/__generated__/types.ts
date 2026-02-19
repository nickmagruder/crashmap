/* eslint-disable */
import { GraphQLResolveInfo } from 'graphql'
import { CrashData } from '../../generated/prisma/client'
export type Maybe<T> = T | null
export type InputMaybe<T> = Maybe<T>
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] }
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> }
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> }
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = {
  [_ in K]?: never
}
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never }
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> }
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string }
  String: { input: string; output: string }
  Boolean: { input: boolean; output: boolean }
  Int: { input: number; output: number }
  Float: { input: number; output: number }
}

export type BBoxInput = {
  maxLat: Scalars['Float']['input']
  maxLng: Scalars['Float']['input']
  minLat: Scalars['Float']['input']
  minLng: Scalars['Float']['input']
}

export type CountyStat = {
  __typename?: 'CountyStat'
  count: Scalars['Int']['output']
  county: Scalars['String']['output']
}

export type Crash = {
  __typename?: 'Crash'
  ageGroup?: Maybe<Scalars['String']['output']>
  city?: Maybe<Scalars['String']['output']>
  colliRptNum: Scalars['ID']['output']
  county?: Maybe<Scalars['String']['output']>
  crashDate?: Maybe<Scalars['String']['output']>
  date?: Maybe<Scalars['String']['output']>
  injuryType?: Maybe<Scalars['String']['output']>
  involvedPersons?: Maybe<Scalars['Int']['output']>
  jurisdiction?: Maybe<Scalars['String']['output']>
  latitude?: Maybe<Scalars['Float']['output']>
  longitude?: Maybe<Scalars['Float']['output']>
  mode?: Maybe<Scalars['String']['output']>
  region?: Maybe<Scalars['String']['output']>
  severity?: Maybe<Scalars['String']['output']>
  state?: Maybe<Scalars['String']['output']>
  time?: Maybe<Scalars['String']['output']>
}

export type CrashFilter = {
  bbox?: InputMaybe<BBoxInput>
  city?: InputMaybe<Scalars['String']['input']>
  county?: InputMaybe<Scalars['String']['input']>
  dateFrom?: InputMaybe<Scalars['String']['input']>
  dateTo?: InputMaybe<Scalars['String']['input']>
  includeNoInjury?: InputMaybe<Scalars['Boolean']['input']>
  mode?: InputMaybe<Scalars['String']['input']>
  severity?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>
  state?: InputMaybe<Scalars['String']['input']>
  year?: InputMaybe<Scalars['Int']['input']>
}

export type CrashResult = {
  __typename?: 'CrashResult'
  items: Array<Crash>
  totalCount: Scalars['Int']['output']
}

export type CrashStats = {
  __typename?: 'CrashStats'
  byCounty: Array<CountyStat>
  byMode: Array<ModeStat>
  bySeverity: Array<SeverityStat>
  totalCrashes: Scalars['Int']['output']
  totalFatal: Scalars['Int']['output']
}

export type FilterOptions = {
  __typename?: 'FilterOptions'
  cities: Array<Scalars['String']['output']>
  counties: Array<Scalars['String']['output']>
  modes: Array<Scalars['String']['output']>
  severities: Array<Scalars['String']['output']>
  states: Array<Scalars['String']['output']>
  years: Array<Scalars['Int']['output']>
}

export type FilterOptionsCitiesArgs = {
  county?: InputMaybe<Scalars['String']['input']>
  state?: InputMaybe<Scalars['String']['input']>
}

export type FilterOptionsCountiesArgs = {
  state?: InputMaybe<Scalars['String']['input']>
}

export type ModeStat = {
  __typename?: 'ModeStat'
  count: Scalars['Int']['output']
  mode: Scalars['String']['output']
}

export type Query = {
  __typename?: 'Query'
  crash?: Maybe<Crash>
  crashStats: CrashStats
  crashes: CrashResult
  filterOptions: FilterOptions
}

export type QueryCrashArgs = {
  colliRptNum: Scalars['ID']['input']
}

export type QueryCrashStatsArgs = {
  filter?: InputMaybe<CrashFilter>
}

export type QueryCrashesArgs = {
  filter?: InputMaybe<CrashFilter>
  limit?: InputMaybe<Scalars['Int']['input']>
  offset?: InputMaybe<Scalars['Int']['input']>
}

export type SeverityStat = {
  __typename?: 'SeverityStat'
  count: Scalars['Int']['output']
  severity: Scalars['String']['output']
}

export type ResolverTypeWrapper<T> = Promise<T> | T

export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>
}
export type Resolver<
  TResult,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ResolverFn<TResult, TParent, TContext, TArgs>
  | ResolverWithResolve<TResult, TParent, TContext, TArgs>

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>

export interface SubscriptionSubscriberObject<
  TResult,
  TKey extends string,
  TParent,
  TContext,
  TArgs,
> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>

export type SubscriptionResolver<
  TResult,
  TKey extends string,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>

export type TypeResolveFn<
  TTypes,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>

export type IsTypeOfResolverFn<
  T = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>

export type NextResolverFn<T> = () => Promise<T>

export type DirectiveResolverFn<
  TResult = Record<PropertyKey, never>,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  BBoxInput: BBoxInput
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>
  CountyStat: ResolverTypeWrapper<CountyStat>
  Crash: ResolverTypeWrapper<CrashData>
  CrashFilter: CrashFilter
  CrashResult: ResolverTypeWrapper<
    Omit<CrashResult, 'items'> & { items: Array<ResolversTypes['Crash']> }
  >
  CrashStats: ResolverTypeWrapper<CrashStats>
  FilterOptions: ResolverTypeWrapper<{}>
  Float: ResolverTypeWrapper<Scalars['Float']['output']>
  ID: ResolverTypeWrapper<Scalars['ID']['output']>
  Int: ResolverTypeWrapper<Scalars['Int']['output']>
  ModeStat: ResolverTypeWrapper<ModeStat>
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>
  SeverityStat: ResolverTypeWrapper<SeverityStat>
  String: ResolverTypeWrapper<Scalars['String']['output']>
}

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  BBoxInput: BBoxInput
  Boolean: Scalars['Boolean']['output']
  CountyStat: CountyStat
  Crash: CrashData
  CrashFilter: CrashFilter
  CrashResult: Omit<CrashResult, 'items'> & { items: Array<ResolversParentTypes['Crash']> }
  CrashStats: CrashStats
  FilterOptions: {}
  Float: Scalars['Float']['output']
  ID: Scalars['ID']['output']
  Int: Scalars['Int']['output']
  ModeStat: ModeStat
  Query: Record<PropertyKey, never>
  SeverityStat: SeverityStat
  String: Scalars['String']['output']
}

export type CountyStatResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['CountyStat'] = ResolversParentTypes['CountyStat'],
> = {
  count?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  county?: Resolver<ResolversTypes['String'], ParentType, ContextType>
}

export type CrashResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['Crash'] = ResolversParentTypes['Crash'],
> = {
  ageGroup?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  city?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  colliRptNum?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  county?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  crashDate?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  date?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  injuryType?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  involvedPersons?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>
  jurisdiction?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  latitude?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>
  longitude?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>
  mode?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  region?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  severity?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  state?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  time?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
}

export type CrashResultResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['CrashResult'] = ResolversParentTypes['CrashResult'],
> = {
  items?: Resolver<Array<ResolversTypes['Crash']>, ParentType, ContextType>
  totalCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
}

export type CrashStatsResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['CrashStats'] = ResolversParentTypes['CrashStats'],
> = {
  byCounty?: Resolver<Array<ResolversTypes['CountyStat']>, ParentType, ContextType>
  byMode?: Resolver<Array<ResolversTypes['ModeStat']>, ParentType, ContextType>
  bySeverity?: Resolver<Array<ResolversTypes['SeverityStat']>, ParentType, ContextType>
  totalCrashes?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  totalFatal?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
}

export type FilterOptionsResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['FilterOptions'] = ResolversParentTypes['FilterOptions'],
> = {
  cities?: Resolver<
    Array<ResolversTypes['String']>,
    ParentType,
    ContextType,
    Partial<FilterOptionsCitiesArgs>
  >
  counties?: Resolver<
    Array<ResolversTypes['String']>,
    ParentType,
    ContextType,
    Partial<FilterOptionsCountiesArgs>
  >
  modes?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>
  severities?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>
  states?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>
  years?: Resolver<Array<ResolversTypes['Int']>, ParentType, ContextType>
}

export type ModeStatResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['ModeStat'] = ResolversParentTypes['ModeStat'],
> = {
  count?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  mode?: Resolver<ResolversTypes['String'], ParentType, ContextType>
}

export type QueryResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query'],
> = {
  crash?: Resolver<
    Maybe<ResolversTypes['Crash']>,
    ParentType,
    ContextType,
    RequireFields<QueryCrashArgs, 'colliRptNum'>
  >
  crashStats?: Resolver<
    ResolversTypes['CrashStats'],
    ParentType,
    ContextType,
    Partial<QueryCrashStatsArgs>
  >
  crashes?: Resolver<
    ResolversTypes['CrashResult'],
    ParentType,
    ContextType,
    RequireFields<QueryCrashesArgs, 'limit' | 'offset'>
  >
  filterOptions?: Resolver<ResolversTypes['FilterOptions'], ParentType, ContextType>
}

export type SeverityStatResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['SeverityStat'] = ResolversParentTypes['SeverityStat'],
> = {
  count?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  severity?: Resolver<ResolversTypes['String'], ParentType, ContextType>
}

export type Resolvers<ContextType = any> = {
  CountyStat?: CountyStatResolvers<ContextType>
  Crash?: CrashResolvers<ContextType>
  CrashResult?: CrashResultResolvers<ContextType>
  CrashStats?: CrashStatsResolvers<ContextType>
  FilterOptions?: FilterOptionsResolvers<ContextType>
  ModeStat?: ModeStatResolvers<ContextType>
  Query?: QueryResolvers<ContextType>
  SeverityStat?: SeverityStatResolvers<ContextType>
}
