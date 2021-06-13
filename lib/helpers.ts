import { Pair, Scalar, YAMLMap, YAMLSeq } from 'yaml/types'


export type NodeType = Scalar | YAMLMap | YAMLSeq | null;

export function isYamlMap( value: NodeType )
: value is YAMLMap
{
	return value?.type === 'MAP' || value?.type === 'FLOW_MAP';
}

export function isYamlSeq( value: NodeType )
: value is YAMLSeq
{
	return value?.type === 'SEQ' || value?.type === 'FLOW_SEQ';
}

export function isScalar( value: any )
: value is null | boolean | number | string
{
	if (
		value == null ||
		typeof value === 'boolean' ||
		typeof value === 'number' ||
		typeof value === 'string'
	)
		return true;
	return false;
}

export function toAstValue( value: any )
{
	if ( isScalar( value ) )
		return new Scalar( value );
	else if ( Array.isArray( value ) )
	{
		const arr = new YAMLSeq( );
		arr.items = value.map( elem => toAstValue( elem ) );
		return arr;
	}
	else if ( typeof value === 'object' )
	{
		const obj = new YAMLMap( );
		obj.items = Object.entries( value )
			.map( ( [ key, value ] ) =>
				new Pair( key, toAstValue( value ) )
			);
		return obj;
	}
	else
		throw new Error( `Invalid type: ${ typeof value }` );
}

export function copyProperties(
	target: NonNullable< NodeType | Pair >,
	source: NonNullable< NodeType | Pair >,
)
{
	target.comment = source.comment;
	target.commentBefore = source.commentBefore;
	target.spaceBefore = source.spaceBefore;
	target.tag = source.tag;
	target.type = source.type;
}

export function cloneNode< T extends NodeType >( node: T ): T
{
	if ( !node )
		return node;

	if ( node.type === 'PLAIN' )
	{
		const ret = new Scalar( node.value );
		ret.format = node.format;
		copyProperties( ret, node );
		return ret as T;
	}
	else if ( isYamlMap( node ) )
	{
		const ret = new YAMLMap( );
		copyProperties( ret, node );
		node.items.map( pair =>
		{
			const newPair = new Pair( pair.key, cloneNode( pair.value ) );
			copyProperties( newPair, pair );
			ret.add( newPair );
		} );
		return ret as T;
	}
	else if ( isYamlSeq( node ) )
	{
		const ret = new YAMLSeq( );
		copyProperties( ret, node );
		node.items.forEach( elem =>
		{
			ret.add( cloneNode( elem ) );
		} );
		return ret as T;
	}
	else
		throw new Error( `Cannot clone unknown type "${node.type}"` );
}

// Gets the index as a number (and <length> if index is '-')
export function parseSafeIndex( index: string, length: number )
{
	if ( index === '-' )
		return length;
	const num = parseInt( index );
	return ( num < 0 || num > length ) ? NaN : num;
}
