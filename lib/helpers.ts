import {
	isMap,
	isSeq,
	Pair,
	isScalar as isYamlScalar,
	Scalar,
	YAMLMap,
	YAMLSeq,
} from 'yaml'
import { NodeBase } from 'yaml/dist/nodes/Node'


export type NodeType = Scalar | YAMLMap | YAMLSeq | null;

export function isYamlMap( value: NodeType ): value is YAMLMap
{
	return !value ? false : isMap( value );
}

export function isYamlSeq( value: NodeType ): value is YAMLSeq
{
	return !value ? false : isSeq( value );
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

export function copyProperties< T extends NodeBase >(
	target: NonNullable< T >,
	source: NonNullable< T >,
)
{
	target.comment = source.comment;
	target.commentBefore = source.commentBefore;
	target.spaceBefore = source.spaceBefore;
	target.tag = source.tag;
	// target.type = source.type;
}

export function cloneNode< T extends NodeType >( node: T ): T
{
	if ( !node )
		return node;

	if ( isYamlScalar( node ) )
	{
		const ret = node.clone( ) as typeof node;
		copyProperties( ret, node );
		return ret;
	}
	else if ( isYamlMap( node ) )
	{
		const ret = new YAMLMap( );
		ret.flow = node.flow;
		copyProperties( ret, node );
		node.items.map( pair =>
		{
			const newPair =
				new Pair( pair.key, cloneNode( pair.value as any ) );
			ret.add( newPair );
		} );
		return ret as T;
	}
	else if ( isYamlSeq( node ) )
	{
		const ret = new YAMLSeq( );
		ret.flow = node.flow;
		copyProperties( ret, node );
		node.items.forEach( elem =>
		{
			ret.add( cloneNode( elem as any ) );
		} );
		return ret as T;
	}
	else
		throw new Error( `Cannot clone unknown type "${(node as any).type}"` );
}

// Gets the index as a number (and <length> if index is '-')
export function parseSafeIndex( index: string, length: number )
{
	if ( index === '-' )
		return length;
	const num = parseInt( index );
	return ( num < 0 || num > length ) ? NaN : num;
}
